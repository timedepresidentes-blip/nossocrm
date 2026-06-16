/**
 * POST /api/messaging/media/finalize
 *
 * Após o upload direto do cliente para o Supabase, esta rota:
 * 1. Para canais Meta Cloud: baixa o arquivo do Supabase e faz re-upload
 *    para a Meta API, retornando o mediaId (evita erro 131053 com URLs externas).
 * 2. Para outros canais: retorna a URL pública do Supabase.
 *
 * Recebe apenas JSON (body pequeno) — o arquivo já está no Supabase.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createStaticAdminClient } from '@/lib/supabase/staticAdminClient';

export const runtime = 'nodejs';
export const maxDuration = 120;

const META_GRAPH_URL = 'https://graph.facebook.com/v25.0';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/3gpp': '3gp',
  'audio/aac': 'aac', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3',
  'audio/amr': 'amr', 'audio/ogg': 'ogg', 'audio/webm': 'webm',
  'application/pdf': 'pdf',
};

async function uploadToMeta(
  fileBuffer: Buffer,
  mimeType: string,
  mediaType: string,
  phoneNumberId: string,
  accessToken: string,
): Promise<string | null> {
  try {
    const ext = MIME_TO_EXT[mimeType] || mediaType;
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mimeType);
    form.append('file', new Blob([new Uint8Array(fileBuffer)], { type: mimeType }), `${mediaType}.${ext}`);

    const res = await fetch(`${META_GRAPH_URL}/${phoneNumberId}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });

    const data = await res.json() as { id?: string; error?: { message: string } };
    if (data.id) {
      console.log(`[finalize] ${mediaType} enviado para Meta, mediaId:`, data.id);
      return data.id;
    }
    console.error(`[finalize] Meta rejeitou upload de ${mediaType}:`, data.error);
    return null;
  } catch (err) {
    console.error(`[finalize] Erro ao enviar ${mediaType} para Meta:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId: string | undefined =
    (user.app_metadata?.organization_id as string | undefined) ??
    await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
      .then(({ data }) => data?.organization_id as string | undefined);
  if (!orgId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const { storagePath, publicUrl, mimeType, conversationId, fileName, fileSize, mediaType } = body ?? {};

  if (!storagePath || !mimeType || !conversationId || !mediaType) {
    return NextResponse.json({ error: 'Campos obrigatórios ausentes' }, { status: 400 });
  }

  const { data: conv } = await supabase
    .from('messaging_conversations')
    .select('id, channel_id')
    .eq('id', conversationId)
    .eq('organization_id', orgId)
    .single();
  if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });

  // Para audio, vídeo e imagem no Meta Cloud: re-upload para a Meta API
  if (mediaType === 'audio' || mediaType === 'video' || mediaType === 'image') {
    const supabaseAdmin = createStaticAdminClient();
    const { data: channelData } = await supabaseAdmin
      .from('messaging_channels')
      .select('provider, credentials')
      .eq('id', conv.channel_id)
      .single();

    if (channelData?.provider === 'meta-cloud') {
      const creds = (channelData.credentials ?? {}) as Record<string, string>;
      const accessToken = creds.accessToken || creds.access_token;
      const phoneNumberId = creds.phoneNumberId || creds.phone_number_id;

      if (accessToken && phoneNumberId) {
        // Baixa o arquivo do Supabase Storage usando admin client
        const { data: fileData, error: downloadErr } = await supabaseAdmin.storage
          .from('messaging-media')
          .download(storagePath);

        if (downloadErr || !fileData) {
          console.error('[finalize] Falha ao baixar arquivo do Supabase:', downloadErr);
        } else {
          const uploadMime = mimeType === 'audio/webm' ? 'audio/ogg' : mimeType;
          const fileBuffer = Buffer.from(await fileData.arrayBuffer());
          const mediaId = await uploadToMeta(fileBuffer, uploadMime, mediaType, phoneNumberId, accessToken);

          if (mediaId) {
            return NextResponse.json({
              mediaUrl: `meta:${mediaId}`,
              mediaType,
              mimeType: uploadMime,
              fileName: fileName || storagePath.split('/').pop(),
              fileSize: fileSize || fileBuffer.length,
            });
          }
          console.warn('[finalize] Upload para Meta falhou — usando URL Supabase como fallback');
        }
      }
    }
  }

  // Fallback: URL pública do Supabase
  return NextResponse.json({
    mediaUrl: publicUrl,
    mediaType,
    mimeType,
    fileName: fileName || storagePath.split('/').pop(),
    fileSize: fileSize || 0,
  });
}
