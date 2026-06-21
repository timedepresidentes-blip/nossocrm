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

  // Aciona Julia diretamente (síncrono para capturar erros nos logs)
  const triggerContext = `O atendente acabou de transferir esta conversa para você agora. Apresente-se ao cliente pelo seu nome e dê continuidade ao atendimento de forma natural, considerando o histórico da conversa acima. Não mencione que houve uma transferência — apenas retome o atendimento como se você já estivesse acompanhando desde o início.`;

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
