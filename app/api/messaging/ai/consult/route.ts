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
import { generateText } from 'ai';
import { getModel } from '@/lib/ai/config';
import { getOrgAIConfig } from '@/lib/ai/agent/agent.service';
import { buildProviderList } from '@/lib/ai/agent/provider-failover';

export const maxDuration = 60;

// Baixa qualquer URL de mídia (data:, meta:ID, http) e retorna base64 + mime
async function downloadMediaUrl(
  url: string,
  fallbackMime: string,
  channelId?: string,
  supabase?: ReturnType<typeof createClient>,
): Promise<{ base64: string; mime: string } | null> {
  if (!url) return null;
  try {
    if (url.startsWith('data:')) {
      const comma = url.indexOf(',');
      if (comma === -1) return null;
      const mime = url.substring(5, comma).split(';')[0] || fallbackMime;
      return { base64: url.substring(comma + 1), mime };
    }
    if (url.startsWith('meta:') && channelId && supabase) {
      const mediaId = url.slice(5);
      const { data: ch } = await supabase.from('messaging_channels').select('credentials').eq('id', channelId).maybeSingle();
      const creds = ch?.credentials as Record<string, unknown> | null;
      const token = (creds?.accessToken ?? creds?.access_token) as string | undefined;
      if (!token) return null;
      const infoRes = await fetch(`https://graph.facebook.com/v25.0/${mediaId}`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
      });
      if (!infoRes.ok) return null;
      const info = await infoRes.json() as { url?: string };
      if (!info.url) return null;
      const mediaRes = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
      if (!mediaRes.ok) return null;
      const mime = mediaRes.headers.get('content-type') || fallbackMime;
      const buf = await mediaRes.arrayBuffer();
      return { base64: Buffer.from(new Uint8Array(buf)).toString('base64'), mime };
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const mime = res.headers.get('content-type') || fallbackMime;
    const buf = await res.arrayBuffer();
    return { base64: Buffer.from(new Uint8Array(buf)).toString('base64'), mime };
  } catch { return null; }
}

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

  // Buscar canal para resolver mídias Meta
  const { data: convRow } = await supabase
    .from('messaging_conversations')
    .select('channel_id')
    .eq('id', conversationId)
    .maybeSingle();
  const channelId = convRow?.channel_id as string | undefined;

  // Buscar histórico da conversa (últimas 50 mensagens)
  const { data: messages } = await supabase
    .from('messaging_messages')
    .select('direction, content, content_type, sender_type, sender_name, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(50);

  const contactName = conversation.external_contact_name || 'cliente';
  const msgList = (messages || []).reverse();

  // Baixar áudios do cliente para transcrição
  const audioFiles: Array<{ base64: string; mime: string }> = [];
  for (const m of msgList) {
    if (m.direction !== 'inbound') continue;
    const c = m.content as Record<string, unknown>;
    if (m.content_type !== 'audio' && c?.type !== 'audio') continue;
    const url = c?.mediaUrl as string | undefined;
    if (!url) continue;
    const fallbackMime = (c?.mimeType as string) || 'audio/ogg';
    const downloaded = await downloadMediaUrl(url, fallbackMime, channelId, supabase);
    if (downloaded) audioFiles.push(downloaded);
  }

  // Formatar histórico
  const historyText = msgList
    .map((m) => {
      const role =
        m.direction === 'inbound'
          ? contactName
          : m.sender_type === 'ai'
          ? (m.sender_name || 'Júlia')
          : 'Atendente';
      const content = m.content as Record<string, unknown>;
      const isAudio = m.content_type === 'audio' || content?.type === 'audio';
      const text = isAudio
        ? '[Áudio do cliente — transcrito acima]'
        : typeof content === 'string'
        ? content
        : content?.text || (content?.type === 'image' ? '[Imagem]' : '[Mídia]');
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
    const hasAudio = audioFiles.length > 0;
    let responseText: string;

    if (hasAudio) {
      // Usa generateText multimodal para incluir áudios
      const model = getModel(providers[0].provider, providers[0].apiKey, providers[0].model);
      const audioParts = audioFiles.map(a => {
        const mime = (a.mime.startsWith('audio/') ? a.mime : 'audio/ogg') as 'audio/ogg' | 'audio/mp3' | 'audio/wav' | 'audio/aac' | 'audio/flac';
        return { type: 'file' as const, data: a.base64, mediaType: mime };
      });
      const result = await generateText({
        model,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            ...audioParts,
            { type: 'text' as const, text: `Há ${audioFiles.length} áudio(s) do cliente acima. Transcreva-os e use as informações para responder.\n\n${userPrompt}` },
          ],
        }],
      });
      responseText = result.text.trim();
    } else {
      // Sem áudio: usa failover normal
      const { generateWithFailover } = await import('@/lib/ai/agent/provider-failover');
      const result = await generateWithFailover({ providers, system: systemPrompt, prompt: userPrompt, maxRetries: 2 });
      responseText = result.text.trim();
    }

    return NextResponse.json({ response: responseText });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[AI Consult] Erro:', msg);
    return NextResponse.json({ error: 'Erro ao consultar Júlia' }, { status: 500 });
  }
}
