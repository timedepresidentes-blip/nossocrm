import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { resumeByAI, processIncomingMessage } from '@/lib/ai/agent/agent.service';

export const maxDuration = 120;

// Inatividade mínima para o Caso A (Julia pausada, atendente sumiu)
const SLA_MINUTES = 15;

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
 * GET /api/cron/sla-resume
 *
 * Roda a cada 5 minutos. Cobre dois cenários:
 *
 * CASO A — Julia estava pausada (ai_paused=true) e atendente sumiu por 15+ min:
 *   → Julia envia mensagem intermediária informando que o atendente vai retornar.
 *
 * CASO B — Atendente designado ficou inativo por takeoverMinutes (padrão 30 min):
 *   → Julia assume o atendimento: desatribui o atendente e continua a conversa.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabase = createAdminClient();

  // =========================================================================
  // CASO A: Julia pausada (ai_paused=true) + atendente inativo há 15+ min
  // =========================================================================
  const cutoff = new Date(Date.now() - SLA_MINUTES * 60 * 1000).toISOString();

  const { data: pausedCandidates, error: convErr } = await supabase
    .from('messaging_conversations')
    .select('id, organization_id, metadata')
    .eq('status', 'open')
    .filter('metadata->>ai_paused', 'eq', 'true');

  if (convErr) {
    console.error('[SLA-Resume] Erro ao buscar conversas pausadas:', convErr.message);
    return json({ error: convErr.message }, 500);
  }

  const resultsA = { checked: pausedCandidates?.length ?? 0, resumed: 0, skipped: 0, errors: 0 };

  for (const conv of pausedCandidates ?? []) {
    try {
      const { data: lastMsg } = await supabase
        .from('messaging_messages')
        .select('direction, created_at')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!lastMsg || lastMsg.direction !== 'inbound' || lastMsg.created_at > cutoff) {
        resultsA.skipped++;
        continue;
      }

      // Evitar reativação duplicada para a mesma mensagem inbound
      const meta = (conv.metadata as Record<string, unknown>) || {};
      if (meta.sla_resumed_at) {
        const resumedAt = new Date(meta.sla_resumed_at as string).getTime();
        if (resumedAt > new Date(lastMsg.created_at).getTime()) {
          resultsA.skipped++;
          continue;
        }
      }

      const result = await resumeByAI(supabase, conv.id, conv.organization_id);
      if (result.success) resultsA.resumed++;
      else { resultsA.errors++; console.warn(`[SLA-A] Falha ${conv.id}:`, result.error); }
    } catch (err) {
      resultsA.errors++;
      console.error(`[SLA-A] Exceção ${conv.id}:`, err);
    }
  }

  // =========================================================================
  // CASO B: Atendente designado inativo — AI Takeover
  // Conversas com assigned_user_id e ai_paused != true onde o atendente
  // não respondeu dentro do prazo configurado (ai_takeover_minutes).
  // =========================================================================
  const TAKEOVER_DEFAULT_MINUTES = 30;
  // Cutoff conservador: 30 min. Verificamos o prazo real por org abaixo.
  const takeoverCutoff = new Date(Date.now() - TAKEOVER_DEFAULT_MINUTES * 60 * 1000).toISOString();

  const { data: takeoverCandidates, error: tkErr } = await supabase
    .from('messaging_conversations')
    .select('id, organization_id, metadata, assigned_user_id, assigned_at, last_message_at')
    .eq('status', 'open')
    .not('assigned_user_id', 'is', null)
    .eq('last_message_direction', 'inbound')
    .lt('last_message_at', takeoverCutoff);

  if (tkErr) {
    console.error('[SLA-Resume] Erro ao buscar candidatos de takeover:', tkErr.message);
  }

  const resultsB = { checked: takeoverCandidates?.length ?? 0, resumed: 0, skipped: 0, errors: 0 };

  for (const conv of takeoverCandidates ?? []) {
    try {
      // Verificar se org tem takeover habilitado
      const { data: orgSettings } = await supabase
        .from('organization_settings')
        .select('ai_takeover_enabled, ai_takeover_minutes, ai_enabled')
        .eq('organization_id', conv.organization_id)
        .maybeSingle();

      if (!orgSettings?.ai_enabled || !orgSettings?.ai_takeover_enabled) {
        resultsB.skipped++;
        continue;
      }

      const takeoverMinutes = Number(orgSettings.ai_takeover_minutes) || TAKEOVER_DEFAULT_MINUTES;

      // Verificar inatividade real: última mensagem do atendente ou assigned_at
      const { data: lastAttMsg } = await supabase
        .from('messaging_messages')
        .select('created_at')
        .eq('conversation_id', conv.id)
        .eq('direction', 'outbound')
        .eq('sender_type', 'user')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const refTime = lastAttMsg?.created_at || conv.assigned_at;
      if (!refTime) { resultsB.skipped++; continue; }

      const minutesSince = (Date.now() - new Date(refTime).getTime()) / 60000;
      if (minutesSince < takeoverMinutes) { resultsB.skipped++; continue; }

      // Evitar takeover duplicado para a mesma mensagem inbound
      const meta = (conv.metadata || {}) as Record<string, unknown>;
      if (meta.sla_takeover_at) {
        const tookOverAt = new Date(meta.sla_takeover_at as string).getTime();
        const lastInboundAt = new Date(conv.last_message_at).getTime();
        if (tookOverAt > lastInboundAt) { resultsB.skipped++; continue; }
      }

      // Buscar texto da última mensagem inbound para passar ao agente
      const { data: lastInbound } = await supabase
        .from('messaging_messages')
        .select('content')
        .eq('conversation_id', conv.id)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastText = (lastInbound?.content as Record<string, unknown>)?.text as string || '';

      // Desatribuir atendente e marcar takeover no metadata
      await supabase
        .from('messaging_conversations')
        .update({
          assigned_user_id: null,
          assigned_at: null,
          metadata: { ...meta, ai_paused: false, sla_takeover_at: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        })
        .eq('id', conv.id);

      // Acionar Julia para continuar de onde a conversa parou
      const result = await processIncomingMessage({
        supabase,
        conversationId: conv.id,
        organizationId: conv.organization_id,
        incomingMessage: lastText,
        triggerContext:
          'O atendente ficou inativo. Leia o histórico completo da conversa e retome o atendimento de onde parou de forma natural. Não mencione a ausência do atendente, não se apresente novamente — apenas continue o assunto.',
      });

      if (result.success) resultsB.resumed++;
      else { resultsB.errors++; console.warn(`[SLA-B] Falha ${conv.id}:`, result.error); }
    } catch (err) {
      resultsB.errors++;
      console.error(`[SLA-B] Exceção ${conv.id}:`, err);
    }
  }

  const summary = { casoA: resultsA, casoB: resultsB };
  console.log('[SLA-Resume] Resultado:', summary);
  return json(summary);
}
