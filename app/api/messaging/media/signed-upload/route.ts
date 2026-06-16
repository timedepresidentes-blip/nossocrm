/**
 * POST /api/messaging/media/signed-upload
 *
 * Gera uma URL assinada do Supabase Storage para upload direto do cliente.
 * O arquivo vai do browser direto para o Supabase, sem passar pelo Vercel,
 * evitando o limite de body (~4-5MB) das serverless functions.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createStaticAdminClient } from '@/lib/supabase/staticAdminClient';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 30;

const ALLOWED_TYPES: Record<string, string[]> = {
  image:    ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  video:    ['video/mp4', 'video/3gpp'],
  audio:    ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg', 'audio/webm'],
  document: [
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv',
  ],
};

const MAX_SIZES: Record<string, number> = {
  image:    5  * 1024 * 1024,
  video:    16 * 1024 * 1024,
  audio:    16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
};

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/3gpp': '3gp',
  'audio/aac': 'aac', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3',
  'audio/amr': 'amr', 'audio/ogg': 'ogg', 'audio/webm': 'webm',
  'application/pdf': 'pdf', 'text/plain': 'txt', 'text/csv': 'csv',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

function getMediaType(mimeType: string) {
  for (const [type, mimes] of Object.entries(ALLOWED_TYPES)) {
    if (mimes.includes(mimeType)) return type as 'image' | 'video' | 'audio' | 'document';
  }
  return null;
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
  const { fileName, mimeType, fileSize, conversationId } = body ?? {};

  if (!fileName || !mimeType || !fileSize || !conversationId) {
    return NextResponse.json({ error: 'fileName, mimeType, fileSize e conversationId são obrigatórios' }, { status: 400 });
  }

  const mediaType = getMediaType(mimeType);
  if (!mediaType) {
    return NextResponse.json({ error: `Tipo não suportado: ${mimeType}` }, { status: 400 });
  }

  const maxSize = MAX_SIZES[mediaType];
  if (fileSize > maxSize) {
    return NextResponse.json(
      { error: `Arquivo excede o limite de ${Math.round(maxSize / 1024 / 1024)}MB para ${mediaType}` },
      { status: 400 }
    );
  }

  const { data: conv } = await supabase
    .from('messaging_conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('organization_id', orgId)
    .single();
  if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });

  const ext = MIME_TO_EXT[mimeType] || 'bin';
  const storagePath = `${orgId}/${conversationId}/${crypto.randomUUID()}.${ext}`;

  const supabaseAdmin = createStaticAdminClient();
  const { data: signed, error: signedErr } = await supabaseAdmin.storage
    .from('messaging-media')
    .createSignedUploadUrl(storagePath);

  if (signedErr || !signed) {
    console.error('[signed-upload] Falha ao gerar URL assinada:', signedErr);
    return NextResponse.json({ error: 'Falha ao gerar URL de upload' }, { status: 500 });
  }

  const { data: urlData } = supabaseAdmin.storage.from('messaging-media').getPublicUrl(storagePath);

  return NextResponse.json({
    signedUrl: signed.signedUrl,
    storagePath,
    publicUrl: urlData.publicUrl,
    mediaType,
  });
}
