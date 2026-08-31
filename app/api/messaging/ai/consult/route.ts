/**
 * @fileoverview Endpoint para o atendente consultar a Júlia sobre uma conversa.
 *
 * Júlia responde APENAS para o atendente (não envia nada ao cliente/WhatsApp).
 * Usa o histórico da conversa como contexto.
 *
 * POST /api/messaging/ai/consult
 * Body: { conversationId: string, question: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getOrgAIConfig } from '@/lib/ai/agent/agent.service';
import { buildProviderList, generateWithFailover } from '@/lib/ai/agent/provider-failover';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // Autenticar via sessão do usuário
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
  const { conversationId, question } = body || {};

  if (!conversationId || !question?.trim()) {
    return NextResponse.json({ error: 'conversationId e question são obrigatórios' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!
  );

  // Verificar acesso à conversa
  const [{ data: profile }, { data: conversation }] = await Promise.all([
    supabase.from('profiles').select('organization_id').eq('id', user.id).single(),
    supabase
      .from('messaging_conversations')
      .select('organization_id, external_contact_name, metadata, contact_id')
      .eq('id', conversationId)
      .single(),
  ]);

  if (!profile?.organization_id) {
    return NextResponse.json({ error: 'Perfil sem organização' }, { status: 403 });
  }

  if (!conversation || conversation.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });
  }

  // Configuração de IA
  const aiConfig = await getOrgAIConfig(supabase, profile.organization_id);
  if (!aiConfig || !aiConfig.enabled) {
    return NextResponse.json({ error: 'IA não configurada para esta organização' }, { status: 503 });
  }

  // Buscar histórico da conversa (últimas 50 mensagens)
  const { data: messages } = await supabase
    .from('messaging_messages')
    .select('direction, content, sender_type, sender_name, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(50);

  const contactName = conversation.external_contact_name || 'cliente';

  // Formatar histórico
  const historyText = (messages || [])
    .reverse()
    .map((m) => {
      const role =
        m.direction === 'inbound'
          ? contactName
          : m.sender_type === 'ai'
          ? (m.sender_name || 'Júlia')
          : 'Atendente';
      const content = m.content as Record<string, unknown>;
      const text = typeof content === 'string'
        ? content
        : content?.text || (content?.type === 'image' ? '[Imagem]' : content?.type === 'audio' ? '[Áudio]' : '[Mídia]');
      return `${role}: ${text}`;
    })
    .join('\n');

  // Buscar ficha do cliente se existir (do deal vinculado)
  let fichaInfo = '';
  const meta = (conversation.metadata || {}) as Record<string, unknown>;
  if (meta.deal_id) {
    const { data: deal } = await supabase
      .from('deals')
      .select('title, custom_fields')
      .eq('id', meta.deal_id as string)
      .single();
    if (deal?.custom_fields) {
      const cf = deal.custom_fields as Record<string, unknown>;
      const campos = Object.entries(cf)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      if (campos) fichaInfo = `\nFicha do cliente: ${campos}`;
    }
  }

  const systemPrompt = `Você é Júlia, assistente de vendas especializada em energia solar.
Um ATENDENTE HUMANO está te consultando — você está respondendo APENAS para o atendente, não para o cliente.
Use o histórico da conversa e os dados do cliente como contexto para responder à pergunta do atendente.
Seja objetiva, técnica quando necessário, e ajude o atendente a tomar a melhor decisão.
Não envie nenhuma mensagem ao cliente — isso é uma consulta interna.`;

  const userPrompt = `Cliente: ${contactName}${fichaInfo}

Histórico da conversa:
${historyText || '(Sem mensagens ainda)'}

---
Pergunta do atendente: ${question}`;

  const providers = buildProviderList({
    provider: aiConfig.provider,
    apiKey: aiConfig.apiKey,
    model: aiConfig.model,
    allKeys: aiConfig.allKeys,
  });

  try {
    const result = await generateWithFailover({
      providers,
      system: systemPrompt,
      prompt: userPrompt,
      maxRetries: 2,
    });
    return NextResponse.json({ response: result.text.trim() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[AI Consult] Erro:', msg);
    return NextResponse.json({ error: 'Erro ao consultar Júlia' }, { status: 500 });
  }
}
