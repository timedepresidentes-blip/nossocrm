import { supabase } from './client';

export interface DealCostData {
  custoNf: number;
  custoNfTipo: 'kit' | 'servico';
  custoArt: number;
  custoEngenharia: number;
  custoCorrugado: number;
  custoEletroduto: number;
  custoFornecedor: number;
  voucherBancoPct: number;
  custosExtras: { descricao: string; valor: number }[];
  custoTotal: number;
  comissaoValor: number;
  lucroBruto: number;
  margemPct: number;
}

export const dealCostsService = {
  async getCosts(dealId: string): Promise<{ data: DealCostData | null; error: Error | null }> {
    try {
      if (!supabase) return { data: null, error: new Error('Supabase não configurado') };

      const { data, error } = await supabase
        .from('deals')
        .select('custo_nf, custo_nf_tipo, custo_art, custo_engenharia, custo_corrugado, custo_eletroduto, custo_fornecedor, voucher_banco_pct, custos_extras, custo_total, comissao_valor, lucro_bruto, margem_pct')
        .eq('id', dealId)
        .maybeSingle();

      if (error) return { data: null, error };
      const defaults: DealCostData = {
        custoNf: 0, custoNfTipo: 'kit', custoArt: 0, custoEngenharia: 0,
        custoCorrugado: 0, custoEletroduto: 0, custoFornecedor: 0, voucherBancoPct: 0,
        custosExtras: [], custoTotal: 0, comissaoValor: 0, lucroBruto: 0, margemPct: 0,
      };
      if (!data) return { data: defaults, error: null };

      const row = data as any;
      return {
        data: {
          custoNf: Number(row.custo_nf ?? 0),
          custoNfTipo: (row.custo_nf_tipo === 'servico' ? 'servico' : 'kit') as 'kit' | 'servico',
          custoArt: Number(row.custo_art ?? 0),
          custoEngenharia: Number(row.custo_engenharia ?? 0),
          custoCorrugado: Number(row.custo_corrugado ?? 0),
          custoEletroduto: Number(row.custo_eletroduto ?? 0),
          custoFornecedor: Number(row.custo_fornecedor ?? 0),
          voucherBancoPct: Number(row.voucher_banco_pct ?? 0),
          custosExtras: Array.isArray(row.custos_extras) ? row.custos_extras : [],
          custoTotal: Number(row.custo_total ?? 0),
          comissaoValor: Number(row.comissao_valor ?? 0),
          lucroBruto: Number(row.lucro_bruto ?? 0),
          margemPct: Number(row.margem_pct ?? 0),
        },
        error: null,
      };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  async updateCosts(dealId: string, updates: Partial<DealCostData>): Promise<{ error: Error | null }> {
    try {
      if (!supabase) return { error: new Error('Supabase não configurado') };

      const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (updates.custoNf !== undefined) payload.custo_nf = updates.custoNf;
      if (updates.custoNfTipo !== undefined) payload.custo_nf_tipo = updates.custoNfTipo;
      if (updates.custoArt !== undefined) payload.custo_art = updates.custoArt;
      if (updates.custoEngenharia !== undefined) payload.custo_engenharia = updates.custoEngenharia;
      if (updates.custoCorrugado !== undefined) payload.custo_corrugado = updates.custoCorrugado;
      if (updates.custoEletroduto !== undefined) payload.custo_eletroduto = updates.custoEletroduto;
      if (updates.custoFornecedor !== undefined) payload.custo_fornecedor = updates.custoFornecedor;
      if (updates.voucherBancoPct !== undefined) payload.voucher_banco_pct = updates.voucherBancoPct;
      if (updates.custosExtras !== undefined) payload.custos_extras = updates.custosExtras;
      if (updates.custoTotal !== undefined) payload.custo_total = updates.custoTotal;
      if (updates.comissaoValor !== undefined) payload.comissao_valor = updates.comissaoValor;
      if (updates.lucroBruto !== undefined) payload.lucro_bruto = updates.lucroBruto;
      if (updates.margemPct !== undefined) payload.margem_pct = updates.margemPct;

      const { error } = await supabase
        .from('deals')
        .update(payload)
        .eq('id', dealId);

      return { error: error ?? null };
    } catch (e) {
      return { error: e as Error };
    }
  },
};

/** Seleciona o custo de engenharia pela faixa de kWp */
export function calcEngCost(kwp: number, cfg: { custoEng1a3kwp: number; custoEng3a5kwp: number; custoEngAcima5kwp: number }): number {
  if (kwp <= 0) return 0;
  if (kwp < 3) return cfg.custoEng1a3kwp;
  if (kwp < 5) return cfg.custoEng3a5kwp;
  return cfg.custoEngAcima5kwp;
}

/** Seleciona a % de comissão pela faixa de kWp */
export function calcComissaoPct(kwp: number, cfg: { custoComissaoPct: number; custoComissaoAcima5kwpPct: number }): number {
  return kwp >= 5 ? cfg.custoComissaoAcima5kwpPct : cfg.custoComissaoPct;
}

/** Calcula o custo de NF
 *  - kit:     valorVenda × pct%
 *  - servico: (valorVenda − custoFornecedor) × pct%  (NF apenas sobre a diferença)
 */
export function calcNfCost(
  valorVenda: number,
  tipo: 'kit' | 'servico',
  cfg: { custoNfKitPct: number; custoNfServicoPct: number },
  custoFornecedor?: number,
): number {
  const pct = tipo === 'servico' ? cfg.custoNfServicoPct : cfg.custoNfKitPct;
  if (tipo === 'servico') {
    const base = Math.max(0, valorVenda - (custoFornecedor ?? 0));
    return base * (pct / 100);
  }
  return valorVenda * (pct / 100);
}

/** Calcula totais a partir dos dados de custo e valor de venda */
export function calcDealCosts(
  costs: Omit<DealCostData, 'custoTotal' | 'comissaoValor' | 'lucroBruto' | 'margemPct'>,
  valorVenda: number,
  comissaoPct: number
): Pick<DealCostData, 'custoTotal' | 'comissaoValor' | 'lucroBruto' | 'margemPct'> {
  const somaExtras = costs.custosExtras.reduce((acc, e) => acc + (e.valor ?? 0), 0);
  const custoFornecedorEfetivo = costs.custoFornecedor * (1 - (costs.voucherBancoPct ?? 0) / 100);
  const custoTotal = costs.custoNf + costs.custoArt + costs.custoEngenharia + costs.custoCorrugado + costs.custoEletroduto + custoFornecedorEfetivo + somaExtras;
  const comissaoValor = valorVenda * (comissaoPct / 100);
  const lucroBruto = valorVenda - custoTotal - comissaoValor;
  const margemPct = valorVenda > 0 ? (lucroBruto / valorVenda) * 100 : 0;
  return { custoTotal, comissaoValor, lucroBruto, margemPct };
}
