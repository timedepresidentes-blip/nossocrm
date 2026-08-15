import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Rota temporária para merge de deals duplicados
// Aceita: { keepId, removeId, newValue?, newTitle? }
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret');
  if (secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY!;
  const sb = createClient(supabaseUrl, supabaseKey);

  const body = await req.json();
  const { keepId, removeId, newValue, newTitle, newClosedAt } = body;

  if (!keepId || !removeId) {
    return NextResponse.json({ error: 'keepId e removeId são obrigatórios' }, { status: 400 });
  }

  // 1. Busca ambos os deals
  const [keepRes, removeRes] = await Promise.all([
    sb.from('deals').select('*').eq('id', keepId).maybeSingle(),
    sb.from('deals').select('*').eq('id', removeId).maybeSingle(),
  ]);

  if (!keepRes.data || !removeRes.data) {
    return NextResponse.json({ error: 'Deal não encontrado', keepRes: keepRes.error, removeRes: removeRes.error }, { status: 404 });
  }

  const keepDeal = keepRes.data as any;
  const removeDeal = removeRes.data as any;

  // 2. Mescla ficha_cliente: prioriza o que tem mais dados
  const keepFicha = keepDeal.ficha_cliente || {};
  const removeFicha = removeDeal.ficha_cliente || {};
  const mergedFicha = { ...removeFicha, ...keepFicha };
  // garante nome completo do contrato (Maria do Carmo)
  if (keepFicha.nomeCompleto) mergedFicha.nomeCompleto = keepFicha.nomeCompleto;
  else if (removeFicha.nomeCompleto) mergedFicha.nomeCompleto = removeFicha.nomeCompleto;

  // 3. Usa melhor valor monetário
  const finalValue = newValue ?? Math.max(Number(keepDeal.value || 0), Number(removeDeal.value || 0));
  const finalTitle = newTitle ?? keepDeal.title;
  const finalClosedAt = newClosedAt ?? keepDeal.closed_at ?? removeDeal.closed_at;

  // 4. Atualiza o deal que vamos manter
  const { error: updateError } = await sb.from('deals').update({
    ficha_cliente: mergedFicha,
    value: finalValue,
    title: finalTitle,
    closed_at: finalClosedAt,
    is_won: true,
    is_lost: false,
    updated_at: new Date().toISOString(),
  }).eq('id', keepId);

  if (updateError) {
    return NextResponse.json({ error: 'Erro ao atualizar deal principal', detail: updateError }, { status: 500 });
  }

  // 5. Marca o deal duplicado como perdido e move para Novo (para sumir do board)
  const { error: removeError } = await sb.from('deals').update({
    is_won: false,
    is_lost: true,
    contrato_assinado: false,
    loss_reason: 'Duplicado — unificado com ' + keepId,
    updated_at: new Date().toISOString(),
  }).eq('id', removeId);

  if (removeError) {
    return NextResponse.json({ error: 'Erro ao marcar deal removido', detail: removeError }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    kept: keepId,
    removed: removeId,
    mergedFicha,
    finalValue,
    finalTitle,
  });
}
