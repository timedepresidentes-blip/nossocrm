/**
 * POST /api/messaging/media/upload
 *
 * Upload media for messaging. Stores in Supabase Storage (backup) and, for audio,
 * faz upload direto para Meta e retorna meta:mediaId para evitar erro 131053.
 * Busca credenciais via admin-client para evitar bloqueio de RLS na coluna 'credentials'.
 * Accepts multipart/form-data with:
 * - file: the media file
 * - conversationId: the target conversation (for org ownership validation)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createStaticAdminClient } from '@/lib/supabase/staticAdminClient';
import crypto from 'crypto';

// Força runtime Node.js — usa Buffer (API Node.js) para processamento de mídia.
// Sem isso o Vercel tenta compilar no Edge Runtime e a rota falha silenciosamente.
export const runtime = 'nodejs';
export const maxDuration = 120;

const META_GRAPH_URL = 'https://graph.facebook.com/v25.0';

// WhatsApp limits (Meta API v25 — https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media)
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB (Meta limit: 5MB)
const MAX_VIDEO_SIZE = 16 * 1024 * 1024; // 16MB (Meta limit: 16MB post-processing)
const MAX_AUDIO_SIZE = 16 * 1024 * 1024; // 16MB
const MAX_DOCUMENT_SIZE = 100 * 1024 * 1024; // 100MB

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/3gpp'];
const ALLOWED_AUDIO_TYPES = ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg', 'audio/webm'];
const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
];

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/3gpp': '3gp',
  'audio/aac': 'aac', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/amr': 'amr',
  'audio/ogg': 'ogg', 'audio/webm': 'webm',
  'application/pdf': 'pdf', 'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt', 'text/csv': 'csv',
};

function getMediaType(mimeType: string): 'image' | 'video' | 'audio' | 'document' | null {
  if (ALLOWED_IMAGE_TYPES.includes(mimeType)) return 'image';
  if (ALLOWED_VIDEO_TYPES.includes(mimeType)) return 'video';
  if (ALLOWED_AUDIO_TYPES.includes(mimeType)) return 'audio';
  if (ALLOWED_DOCUMENT_TYPES.includes(mimeType)) return 'document';
  return null;
}

function getMaxSize(mediaType: string): number {
  switch (mediaType) {
    case 'image': return MAX_IMAGE_SIZE;
    case 'video': return MAX_VIDEO_SIZE;
    case 'audio': return MAX_AUDIO_SIZE;
    case 'document': return MAX_DOCUMENT_SIZE;
    default: return MAX_DOCUMENT_SIZE;
  }
}

// Faz upload de áudio direto para Meta usando o buffer já em memória
async function uploadAudioToMeta(
  fileBuffer: Buffer,
  mimeType: string,
  phoneNumberId: string,
  accessToken: string,
): Promise<string | null> {
  try {
    const ext = MIME_TO_EXT[mimeType] || 'mp3';
    const filename = `audio.${ext}`;

    const metaForm = new FormData();
    metaForm.append('messaging_product', 'whatsapp');
    metaForm.append('type', mimeType);
    metaForm.append('file', new Blob([new Uint8Array(fileBuffer)], { type: mimeType }), filename);

    const res = await fetch(`${META_GRAPH_URL}/${phoneNumberId}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: metaForm,
    });

    const data = await res.json() as { id?: string; error?: { message: string; code: number } };
    if (data.id) {
      console.log('[upload] Áudio enviado para Meta, mediaId:', data.id);
      return data.id;
    }
    console.error('[upload] Meta rejeitou upload de áudio:', JSON.stringify(data.error));
    return null;
  } catch (err) {
    console.error('[upload] Falha no upload de áudio para Meta:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Busca org_id do usuário
  const orgId: string | undefined =
    (user.app_metadata?.organization_id as string | undefined) ??
    await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()
      .then(({ data }) => data?.organization_id as string | undefined);

  if (!orgId) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const conversationId = formData.get('conversationId') as string | null;

  if (!file || !conversationId) {
    return NextResponse.json(
      { error: 'file and conversationId are required' },
      { status: 400 }
    );
  }

  // Valida que a conversa pertence à org (cookie-client, RLS aplicado)
  const { data: conversation } = await supabase
    .from('messaging_conversations')
    .select('id, channel_id')
    .eq('id', conversationId)
    .eq('organization_id', orgId)
    .single();

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  // Validate file type
  const mediaType = getMediaType(file.type);
  if (!mediaType) {
    return NextResponse.json(
      { error: `Tipo de arquivo não suportado: ${file.type}` },
      { status: 400 }
    );
  }

  // Validate file size
  const maxSize = getMaxSize(mediaType);
  if (file.size > maxSize) {
    const maxMB = Math.round(maxSize / (1024 * 1024));
    return NextResponse.json(
      { error: `Arquivo excede o limite de ${maxMB}MB para ${mediaType}` },
      { status: 400 }
    );
  }

  try {
    const ext = MIME_TO_EXT[file.type] || 'bin';
    const uniqueId = crypto.randomUUID();
    const storagePath = `${orgId}/${conversationId}/${uniqueId}.${ext}`;

    // Lê o buffer uma vez — usado tanto para Supabase quanto para Meta
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // Upload to Supabase Storage (backup para reprodução no CRM)
    const { error: uploadError } = await supabase.storage
      .from('messaging-media')
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('[API] Media upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage
      .from('messaging-media')
      .getPublicUrl(storagePath);

    // Para áudio: faz upload direto para Meta usando admin-client para ler credenciais.
    // O cookie-client (RLS) bloqueia leitura da coluna 'credentials' em messaging_channels.
    if (mediaType === 'audio') {
      const supabaseAdmin = createStaticAdminClient();
      const { data: channelData } = await supabaseAdmin
        .from('messaging_channels')
        .select('provider, credentials')
        .eq('id', conversation.channel_id)
        .single();

      if (channelData?.provider === 'meta-cloud') {
        const creds = (channelData.credentials ?? {}) as Record<string, string>;
        const access_token = creds.accessToken || creds.access_token;
        const phone_number_id = creds.phoneNumberId || creds.phone_number_id;
        if (access_token && phone_number_id) {
          const mediaId = await uploadAudioToMeta(fileBuffer, file.type, phone_number_id, access_token);
          if (mediaId) {
            return NextResponse.json({
              mediaUrl: `meta:${mediaId}`,
              mediaType,
              mimeType: file.type,
              fileName: file.name,
              fileSize: file.size,
            });
          }
          console.warn('[upload] Upload para Meta falhou — usando URL Supabase como fallback');
        } else {
          console.error('[upload] Credenciais ausentes no canal:', conversation.channel_id);
        }
      }
    }

    return NextResponse.json({
      mediaUrl: urlData.publicUrl,
      mediaType,
      mimeType: file.type,
      fileName: file.name,
      fileSize: file.size,
    });
  } catch (error) {
    console.error('[API] Media upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload media' },
      { status: 500 }
    );
  }
}
