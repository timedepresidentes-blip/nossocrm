/**
 * GET /api/messaging/media?id=MEDIA_ID&conversationId=CONV_ID
 *
 * Proxy para mídias do Meta Cloud API.
 * O Meta armazena mídias com IDs temporários que requerem autenticação para download.
 * Esta rota resolve o ID → URL real → binário e devolve ao cliente de forma segura.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const META_GRAPH_URL = 'https://graph.facebook.com/v25.0';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const mediaId = searchParams.get('id');
  const conversationId = searchParams.get('conversationId');

  if (!mediaId || !conversationId) {
    return NextResponse.json({ error: 'id e conversationId são obrigatórios' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Busca org do usuário
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 });
  }

  // Busca conversa + credenciais do canal — valida que conversa pertence à org
  const { data: conversation } = await supabase
    .from('messaging_conversations')
    .select(`
      id,
      channel:messaging_channels!channel_id (
        provider,
        credentials
      )
    `)
    .eq('id', conversationId)
    .eq('organization_id', profile.organization_id)
    .single();

  if (!conversation) {
    return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });
  }

  type ChannelRow = { provider: string; credentials: Record<string, string> };
  const channel = conversation.channel as unknown as ChannelRow | null;

  if (!channel || channel.provider !== 'meta-cloud') {
    return NextResponse.json({ error: 'Canal não é Meta Cloud' }, { status: 400 });
  }

  // Suporta camelCase e snake_case para compatibilidade com canais legados
  const creds = channel.credentials ?? {} as Record<string, string>;
  const accessToken = creds.accessToken || creds.access_token;
  if (!accessToken) {
    console.error('[media-proxy] accessToken ausente nas credenciais:', Object.keys(creds));
    return NextResponse.json({ error: 'Canal sem credenciais configuradas' }, { status: 500 });
  }

  // Passo 1: pede ao Meta a URL de download real (expira, por isso não cacheamos no DB)
  const infoRes = await fetch(`${META_GRAPH_URL}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!infoRes.ok) {
    console.error('[media-proxy] Meta info error:', await infoRes.text());
    return NextResponse.json({ error: 'Falha ao obter info da mídia no Meta' }, { status: 502 });
  }

  const info = await infoRes.json() as { url?: string; mime_type?: string; error?: unknown };

  if (!info.url) {
    console.error('[media-proxy] Meta não retornou URL:', info);
    return NextResponse.json({ error: 'URL de mídia não encontrada' }, { status: 502 });
  }

  // Passo 2: faz download do binário (a URL do Meta também requer o token)
  const mediaRes = await fetch(info.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!mediaRes.ok) {
    console.error('[media-proxy] Download error:', mediaRes.status);
    return NextResponse.json({ error: 'Falha ao baixar mídia do Meta' }, { status: 502 });
  }

  const contentType =
    info.mime_type ||
    mediaRes.headers.get('content-type') ||
    'application/octet-stream';

  // Buffer completo para suportar Range requests (necessário para áudio funcionar no browser)
  const buffer = Buffer.from(await mediaRes.arrayBuffer());
  const totalSize = buffer.length;

  const rangeHeader = req.headers.get('range');
  if (rangeHeader) {
    const [unit, rangeValue] = rangeHeader.split('=');
    if (unit === 'bytes' && rangeValue) {
      const [startStr, endStr] = rangeValue.split('-');
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : totalSize - 1;
      const clampedEnd = Math.min(end, totalSize - 1);
      const chunkSize = clampedEnd - start + 1;
      return new NextResponse(buffer.subarray(start, clampedEnd + 1), {
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Range': `bytes ${start}-${clampedEnd}/${totalSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize.toString(),
        },
      });
    }
  }

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': totalSize.toString(),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
