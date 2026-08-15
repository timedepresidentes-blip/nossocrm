import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret');
  if (secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY!;
  const sb = createClient(supabaseUrl, supabaseKey);

  const body = await req.json();
  const { dealId, updates } = body;

  if (!dealId || !updates) {
    return NextResponse.json({ error: 'dealId e updates são obrigatórios' }, { status: 400 });
  }

  const before = await sb.from('deals').select('id,title,is_won,is_lost,stage_id,contrato_assinado').eq('id', dealId).maybeSingle();
  if (!before.data) {
    return NextResponse.json({ error: 'Deal não encontrado', detail: before.error }, { status: 404 });
  }

  const { error } = await sb.from('deals').update({
    ...updates,
    updated_at: new Date().toISOString(),
  }).eq('id', dealId);

  if (error) {
    return NextResponse.json({ error: 'Falha ao atualizar', detail: error }, { status: 500 });
  }

  const after = await sb.from('deals').select('id,title,is_won,is_lost,stage_id,contrato_assinado').eq('id', dealId).maybeSingle();

  return NextResponse.json({ ok: true, before: before.data, after: after.data });
}
