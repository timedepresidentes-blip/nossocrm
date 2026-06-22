/**
 * @fileoverview Endpoint para acionamento imediato da Julia por handoff manual.
 *
 * Chamado quando o atendente usa "Devolver para Júlia" no TransferButton.
 * Faz tudo no servidor: remove assignee, despausa IA e aciona Julia imediatamente.
 *
 * POST /api/messaging/ai/trigger
 * Body: { conversationId }
 *
 * Autenticação: sessão Supabase do usuário logado.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { processIncomingMessage } from '@/lib/ai/agent';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // Autenticar via sessão do usuário (cookies da sessão)
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const { conversationId } = body || {};

  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId obrigatório' }, { status: 400 });
  }

  // Service role para operações no banco
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!
  );

  // Verificar que o usuário pertence à mesma org da conversa
  const [{ data: profile }, { data: conversation }] = await Promise.all([
    supabase.from('profiles').select('organization_id').eq('id', user.id).single(),
    supabase.from('messaging_conversations').select('organization_id, metadata').eq('id', conversationId).single(),
  ]);

  if (!profile?.organization_id) {
    return NextResponse.json({ error: 'Perfil sem organização' }, { status: 403 });
  }

  if (!conversation || conversation.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });
  }

  // Despausa a IA e remove o assignee (tudo num só update)
  const currentMetadata = (conversation.metadata || {}) as Record<string, unknown>;
  await supabase
    .from('messaging_conversations')
    .update({
      metadata: { ...currentMetadata, ai_paused: false },
      assigned_user_id: null,
      assigned_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);

  // Verificar se já há histórico de mensagens para adaptar o contexto de trigger
  const { count: messageCount } = await supabase
    .from('messaging_messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId);

  const hasHistory = (messageCount ?? 0) > 0;

  // Com histórico: continua o assunto de onde parou, sem apresentação
  // Sem histórico: primeira vez, se apresenta normalmente
  const triggerContext = hasHistory
    ? `Você acabou de receber esta conversa de volta. Leia todo o histórico de mensagens acima com atenção e envie UMA mensagem dando continuidade natural ao assunto — responda à última mensagem do cliente ou avance no ponto onde a conversa estava. Não se apresente novamente, não mencione transferência, não repita o que já foi dito. Apenas continue o atendimento de forma fluida, como se você já estivesse acompanhando desde o início.`
    : `Você está iniciando o atendimento desta conversa. Apresente-se pelo seu nome e inicie o atendimento de forma natural e acolhedora.`;

  let juliaResult: Record<string, unknown> = {};
  try {
    const result = await processIncomingMessage({
      supabase,
      conversationId,
      organizationId: profile.organization_id,
      incomingMessage: '',
      triggerContext,
    });
    juliaResult = { action: result.decision?.action, reason: result.decision?.reason, success: result.success };
    console.log('[AI Trigger] Julia concluiu:', juliaResult);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[AI Trigger] Erro ao acionar Julia:', msg);
    juliaResult = { error: msg };
  }

  return NextResponse.json({ triggered: true, julia: juliaResult });
}
