import { createClient } from '@/lib/supabase/server';
import { resumeByAI } from '@/lib/ai/agent/agent.service';

export const maxDuration = 120;

const SLA_MINUTES = 15;

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * GET /api/cron/sla-resume
 *
 * Roda a cada 5 minutos via Vercel Cron.
 * Detecta conversas onde o atendente humano não respondeu em 15 minutos
 * e aciona a Julia para fazer o intermédio até o atendente retomar.
 *
 * Condição: conversa aberta + ai_paused=true + última mensagem é inbound + há mais de 15 min
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabase = await createClient();
  const cutoff = new Date(Date.now() - SLA_MINUTES * 60 * 1000).toISOString();

  // Busca conversas abertas onde a Julia está pausada (humano atendendo)
  const { data: candidates, error: convErr } = await supabase
    .from('messaging_conversations')
    .select('id, organization_id, metadata')
    .eq('status', 'open')
    .filter('metadata->>ai_paused', 'eq', 'true');

  if (convErr) {
    console.error('[SLA-Resume] Erro ao buscar conversas:', convErr.message);
    return json({ error: convErr.message }, 500);
  }

  if (!candidates || candidates.length === 0) {
    return json({ checked: 0, resumed: 0 });
  }

  const results = { checked: candidates.length, resumed: 0, skipped: 0, errors: 0 };

  for (const conv of candidates) {
    try {
      // Verifica a última mensagem da conversa
      const { data: lastMsg } = await supabase
        .from('messaging_messages')
        .select('direction, created_at')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Só age se:
      // 1. A última mensagem é do contato (inbound)
      // 2. Passou mais de 15 min desde essa mensagem
      if (!lastMsg || lastMsg.direction !== 'inbound') {
        results.skipped++;
        continue;
      }

      const ageMs = Date.now() - new Date(lastMsg.created_at).getTime();
      if (ageMs < SLA_MINUTES * 60 * 1000) {
        results.skipped++;
        continue;
      }

      // Evita reativação duplicada: se `sla_resumed_at` já existir e for
      // mais recente que a última mensagem inbound, Julia já atuou
      const meta = (conv.metadata as Record<string, unknown>) || {};
      if (meta.sla_resumed_at) {
        const resumedAt = new Date(meta.sla_resumed_at as string).getTime();
        const lastInboundAt = new Date(lastMsg.created_at).getTime();
        if (resumedAt > lastInboundAt) {
          results.skipped++;
          continue;
        }
      }

      // Aciona Julia
      const result = await resumeByAI(supabase, conv.id, conv.organization_id);
      if (result.success) {
        results.resumed++;
      } else {
        results.errors++;
        console.warn(`[SLA-Resume] Falha na conversa ${conv.id}:`, result.error);
      }
    } catch (err) {
      results.errors++;
      console.error(`[SLA-Resume] Exceção na conversa ${conv.id}:`, err);
    }
  }

  console.log('[SLA-Resume] Resultado:', results);
  return json(results);
}
