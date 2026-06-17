import { createClient } from '@/lib/supabase/server';
import { getChannelRouter } from '@/lib/messaging';

export const maxDuration = 120;

// ID da etiqueta "Sem retorno" — mapeada para stage "Perdido" no pipeline
const SEM_RETORNO_LABEL_ID = '87cb5db1-2c3e-4589-9985-ff8b12304af8';

const REACTIVATION_TEMPLATES = [
  'Oi {nome}! Percebi que nossa conversa ficou em aberto. Ainda posso te ajudar? 😊',
  'Olá {nome}, tudo bem? Queria retomar nosso papo e entender se você ainda tem interesse. Posso te ajudar a decidir?',
  'Oi {nome}! É minha última tentativa de contato — fico à disposição se quiser retomar. Obrigada pelo seu tempo! 🙏',
];

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * GET /api/cron/reactivation
 *
 * Executa a cada hora: identifica conversas sem resposta do cliente há 24h,
 * aplica etiqueta "Sem retorno" e envia mensagem de reativação via Julia (até 3x).
 * Protegido por CRON_SECRET.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabase = await createClient();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Busca conversas abertas com < 3 tentativas de reativação
  const { data: conversations, error: convError } = await supabase
    .from('messaging_conversations')
    .select('id, contact_id, channel_id, external_contact_id, external_contact_name, reactivation_attempts')
    .eq('status', 'open')
    .lt('reactivation_attempts', 3);

  if (convError) {
    console.error('[Reactivation] Failed to fetch conversations:', convError);
    return json({ error: convError.message }, 500);
  }

  if (!conversations || conversations.length === 0) {
    return json({ processed: 0 });
  }

  // Para cada conversa, verifica se o último msg INBOUND foi há > 24h
  const results = { processed: 0, labeled: 0, sent: 0, errors: 0 };

  for (const conv of conversations) {
    try {
      // Verifica última mensagem inbound
      const { data: lastInbound } = await supabase
        .from('messaging_messages')
        .select('created_at')
        .eq('conversation_id', conv.id)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!lastInbound) continue; // Nunca houve mensagem inbound
      if (lastInbound.created_at >= cutoff) continue; // Respondeu nas últimas 24h

      // Verifica se já enviamos mensagem de reativação após o último inbound
      const { data: lastOutbound } = await supabase
        .from('messaging_messages')
        .select('created_at, metadata')
        .eq('conversation_id', conv.id)
        .eq('direction', 'outbound')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Não reativa se já enviamos mensagem de reativação após o último inbound
      if (lastOutbound && lastOutbound.created_at > lastInbound.created_at) continue;

      results.processed++;

      // Aplica etiqueta "Sem retorno" se o contato tem id e ainda não tem a etiqueta
      if (conv.contact_id) {
        const { data: existingLabel } = await supabase
          .from('contact_labels')
          .select('id')
          .eq('contact_id', conv.contact_id)
          .eq('label_id', SEM_RETORNO_LABEL_ID)
          .maybeSingle();

        if (!existingLabel) {
          await supabase
            .from('contact_labels')
            .insert({ contact_id: conv.contact_id, label_id: SEM_RETORNO_LABEL_ID });
          results.labeled++;
        }
      }

      // Seleciona template baseado no número de tentativas (0, 1, 2)
      const attempt = (conv.reactivation_attempts ?? 0) as number;
      const firstName = (conv.external_contact_name ?? 'você').split(' ')[0];
      const template = REACTIVATION_TEMPLATES[attempt] ?? REACTIVATION_TEMPLATES[2];
      const message = template.replace('{nome}', firstName);

      // Insere mensagem no banco
      const { data: dbMsg, error: insertError } = await supabase
        .from('messaging_messages')
        .insert({
          conversation_id: conv.id,
          direction: 'outbound',
          content_type: 'text',
          content: { type: 'text', text: message },
          status: 'pending',
          sender_type: 'ai',
          metadata: { sent_by_ai: true, reactivation: true, attempt },
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('[Reactivation] Failed to insert message:', insertError);
        results.errors++;
        continue;
      }

      // Envia via canal
      try {
        const router = getChannelRouter();
        const sendResult = await router.sendMessage(conv.channel_id, {
          conversationId: conv.id,
          to: conv.external_contact_id,
          content: { type: 'text', text: message },
        });

        if (sendResult.success) {
          await supabase
            .from('messaging_messages')
            .update({ external_id: sendResult.externalMessageId, status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', dbMsg.id);
          results.sent++;
        } else {
          await supabase
            .from('messaging_messages')
            .update({ status: 'failed' })
            .eq('id', dbMsg.id);
          results.errors++;
        }
      } catch (sendErr) {
        console.error('[Reactivation] Send failed:', sendErr);
        await supabase
          .from('messaging_messages')
          .update({ status: 'failed' })
          .eq('id', dbMsg.id);
        results.errors++;
      }

      // Incrementa contador de tentativas e registra timestamp
      await supabase
        .from('messaging_conversations')
        .update({
          reactivation_attempts: attempt + 1,
          last_reactivation_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', conv.id);

      // Na 3ª tentativa (attempt === 2), fecha a conversa automaticamente
      if (attempt >= 2) {
        await supabase
          .from('messaging_conversations')
          .update({ status: 'resolved', updated_at: new Date().toISOString() })
          .eq('id', conv.id);
      }
    } catch (err) {
      console.error('[Reactivation] Error processing conversation:', conv.id, err);
      results.errors++;
    }
  }

  console.log('[Reactivation] Done:', results);
  return json(results);
}
