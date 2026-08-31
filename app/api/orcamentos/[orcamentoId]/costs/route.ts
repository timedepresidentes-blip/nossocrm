import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ orcamentoId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { orcamentoId } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('orcamento_costs')
    .select('*')
    .eq('organization_id', profile.organization_id)
    .eq('orcamento_id', orcamentoId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ costs: data ?? null });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { orcamentoId } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const body = await req.json();

  const payload = {
    organization_id: profile.organization_id,
    orcamento_id: orcamentoId,
    custo_nf: body.custoNf ?? 0,
    custo_nf_tipo: body.custoNfTipo ?? 'kit',
    custo_engenharia: body.custoEngenharia ?? 0,
    custo_instalacao: body.custoInstalacao ?? 0,
    custo_corrugado: body.custoCorrugado ?? 0,
    custo_eletroduto: body.custoEletroduto ?? 0,
    custo_fornecedor: body.custoFornecedor ?? 0,
    voucher_banco_pct: body.voucherBancoPct ?? 0,
    custos_extras: body.custosExtras ?? [],
    custo_total: body.custoTotal ?? 0,
    comissao_valor: body.comissaoValor ?? 0,
    lucro_bruto: body.lucroBruto ?? 0,
    margem_pct: body.margemPct ?? 0,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('orcamento_costs')
    .upsert(payload, { onConflict: 'organization_id,orcamento_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
