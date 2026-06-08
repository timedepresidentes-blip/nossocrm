import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';

/**
 * PATCH /api/profile
 * Atualiza campos editáveis do perfil do usuário logado.
 */
export async function PATCH(req: NextRequest) {
  if (!isAllowedOrigin(req)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  // Campos permitidos para edição pelo próprio usuário
  const allowed = ['first_name', 'last_name', 'nickname', 'phone', 'avatar_url', 'signature'];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ message: 'No valid fields to update' }, { status: 400 });
  }

  update.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', user.id)
    .select()
    .single();

  if (error) {
    console.error('[api/profile PATCH]', error);
    return NextResponse.json({ message: 'Failed to update profile' }, { status: 500 });
  }

  return NextResponse.json(data);
}
