import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getChannelRouter } from '@/lib/messaging';

export const maxDuration = 120;

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!
  );
}

/**
 * GET /api/cron/scheduled-messages
 *
 * Roda a cada minuto. Busca mensagens agendadas com status=pending
 * cujo scheduled_at já passou e as envia via canal WhatsApp.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Buscar mensagens pendentes cujo horário já chegou
  const { data: messages, error } = await supabase
    .from('scheduled_messages')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(50);

  if (error) {
    console.error('[ScheduledMessages] Erro ao buscar mensagens:', error.message);
    return json({ error: error.message }, 500);
  }

  const results = { total: messages?.length ?? 0, sent: 0, failed: 0 };

  for (const msg of messages ?? []) {
    try {
      // Marcar como 'sending' para evitar duplo envio em execuções paralelas
      const { error: lockErr } = await supabase
        .from('scheduled_messages')
        .update({ status: 'sent' })
        .eq('id', msg.id)
        .eq('status', 'pending');

      if (lockErr) {
        // Outra instância já pegou esta mensagem
        console.warn(`[ScheduledMessages] Mensagem ${msg.id} já processada por outra instância`);
        continue;
      }

      // Verificar se há conversa e canal associados
      if (!msg.conversation_id || !msg.channel_id) {
        // Sem conversa vinculada — não é possível enviar sem canal
        await supabase.from('scheduled_messages').update({
          status: 'failed',
          error_message: 'Sem conversa ou canal vinculado',
          sent_at: new Date().toISOString(),
        }).eq('id', msg.id);
        results.failed++;
        continue;
      }

      // Verificar se a janela de 24h ainda está aberta
      const { data: conversation } = await supabase
        .from('messaging_conversations')
        .select('id, external_contact_id, window_expires_at, channel_id')
        .eq('id', msg.conversation_id)
        .maybeSingle();

      if (!conversation) {
        await supabase.from('scheduled_messages').update({
          status: 'failed',
          error_message: 'Conversa não encontrada',
          sent_at: new Date().toISOString(),
        }).eq('id', msg.id);
        results.failed++;
        continue;
      }

      // Avisar via erro se a janela expirou (mas tentar mesmo assim)
      const windowExpired = conversation.window_expires_at
        ? new Date(conversation.window_expires_at) < new Date()
        : true;

      if (windowExpired) {
        await supabase.from('scheduled_messages').update({
          status: 'failed',
          error_message: 'Janela de 24h expirada — use um template para reabrir',
          sent_at: new Date().toISOString(),
        }).eq('id', msg.id);
        results.failed++;
        console.warn(`[ScheduledMessages] Janela expirada para conversa ${msg.conversation_id}`);
        continue;
      }

      // Enviar a mensagem via canal router
      const router = getChannelRouter();
      const result = await router.sendMessage(msg.channel_id, {
        conversationId: msg.conversation_id,
        to: conversation.external_contact_id,
        content: { type: 'text', text: msg.message },
      });

      if (result.success) {
        await supabase.from('scheduled_messages').update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          error_message: null,
        }).eq('id', msg.id);
        results.sent++;
        console.log(`[ScheduledMessages] Enviada: ${msg.id} para ${msg.contact_name ?? msg.external_contact_id}`);
      } else {
        await supabase.from('scheduled_messages').update({
          status: 'failed',
          error_message: result.error?.message ?? 'Erro desconhecido no provider',
          sent_at: new Date().toISOString(),
        }).eq('id', msg.id);
        results.failed++;
        console.error(`[ScheduledMessages] Falha ao enviar ${msg.id}:`, result.error);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[ScheduledMessages] Exceção ao processar ${msg.id}:`, errMsg);
      await supabase.from('scheduled_messages').update({
        status: 'failed',
        error_message: errMsg,
        sent_at: new Date().toISOString(),
      }).eq('id', msg.id).eq('status', 'sent'); // só atualiza se ainda marcado como sent pelo lock
      results.failed++;
    }
  }

  console.log('[ScheduledMessages] Resultado:', results);
  return json(results);
}
