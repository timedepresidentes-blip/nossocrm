import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createStaticAdminClient } from '@/lib/supabase/staticAdminClient';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 30;

const ALLOWED_TYPES: Record<string, string[]> = {
  image:    ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  document: [
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv',
  ],
};

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'application/pdf': 'pdf', 'text/plain': 'txt', 'text/csv': 'csv',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

function getMediaType(mimeType: string) {
  for (const [type, mimes] of Object.entries(ALLOWED_TYPES)) {
    if (mimes.includes(mimeType)) return type;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { fileName, mimeType, fileSize, orgId } = body ?? {};

  if (!fileName || !mimeType || !fileSize || !orgId) {
    return NextResponse.json({ error: 'Campos obrigatórios ausentes' }, { status: 400 });
  }

  if (!getMediaType(mimeType)) {
    return NextResponse.json({ error: `Tipo não suportado: ${mimeType}` }, { status: 400 });
  }

  if (fileSize > MAX_SIZE) {
    return NextResponse.json({ error: 'Arquivo excede o limite de 10MB' }, { status: 400 });
  }

  const ext = MIME_TO_EXT[mimeType] || 'bin';
  const storagePath = `internal-chat/${orgId}/${crypto.randomUUID()}.${ext}`;

  const admin = createStaticAdminClient();
  const { data: signed, error: signedErr } = await admin.storage
    .from('messaging-media')
    .createSignedUploadUrl(storagePath);

  if (signedErr || !signed) {
    return NextResponse.json({ error: 'Falha ao gerar URL de upload' }, { status: 500 });
  }

  const { data: urlData } = admin.storage.from('messaging-media').getPublicUrl(storagePath);

  return NextResponse.json({
    signedUrl: signed.signedUrl,
    token: signed.token,
    publicUrl: urlData.publicUrl,
    mediaType: getMediaType(mimeType),
  });
}
