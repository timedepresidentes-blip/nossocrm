import { NextRequest, NextResponse } from 'next/server';
import { createStaticAdminClient } from '@/lib/supabase/server';
import { sanitizeUUID } from '@/lib/supabase/utils';

export const runtime = 'nodejs';

// Permite requisições cross-origin vindas do OrçaFácil
const ORCAFACIL_ORIGIN = 'https://app-eight-eta-92.vercel.app';

function corsHeaders(origin: string | null) {
  const allowed = origin === ORCAFACIL_ORIGIN ? origin : ORCAFACIL_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const headers = corsHeaders(origin);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers });
  }

  const dealId = sanitizeUUID(String(body.dealId ?? ''));
  const orgId = sanitizeUUID(String(body.orgId ?? ''));

  if (!dealId || !orgId) {
    return NextResponse.json({ error: 'dealId e orgId são obrigatórios' }, { status: 422, headers });
  }

  const sb = createStaticAdminClient();

  // Busca o deal validando que pertence à organização
  const { data: deal, error: dealErr } = await sb
    .from('deals')
    .select('id, board_id, stage_id, tags, is_won, is_lost')
    .eq('id', dealId)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .maybeSingle();

  if (dealErr || !deal) {
    return NextResponse.json({ error: 'Deal não encontrado' }, { status: 404, headers });
  }

  if ((deal as any).is_won || (deal as any).is_lost) {
    return NextResponse.json({ ok: true, message: 'Deal já encerrado' }, { headers });
  }

  // Busca os estágios do board ordenados por posição
  const { data: stages } = await sb
    .from('board_stages')
    .select('id, position, label')
    .eq('board_id', (deal as any).board_id)
    .order('position', { ascending: true });

  // Avança para o próximo estágio
  const currentIdx = (stages ?? []).findIndex((s: any) => s.id === (deal as any).stage_id);
  const nextStage = (stages ?? [])[currentIdx + 1] ?? null;

  // Adiciona tag "Proposta Gerada" sem duplicar
  const existingTags: string[] = (deal as any).tags ?? [];
  const newTags = existingTags.includes('Proposta Gerada')
    ? existingTags
    : [...existingTags, 'Proposta Gerada'];

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { tags: newTags, updated_at: now };

  if (nextStage) {
    updates.stage_id = (nextStage as any).id;
    updates.last_stage_change_date = now;
  }

  await sb.from('deals').update(updates).eq('id', dealId).eq('organization_id', orgId);

  return NextResponse.json({ ok: true, nextStage: (nextStage as any)?.label ?? null }, { headers });
}
