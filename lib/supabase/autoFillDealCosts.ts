import { supabase } from './client';
import { orgSettingsService } from './orgSettings';
import { dealCostsService, calcEngCost, calcComissaoPct, calcNfCost } from './dealCosts';

/**
 * Ao fechar um deal como GANHO, sincroniza os custos financeiros:
 * - Se o campo já tem valor, mantém o existente
 * - Se está zerado, preenche com o padrão da org (baseado em kWp e valor de venda)
 * - Sempre recalcula custo_total, lucro_bruto e margem_pct
 */
export async function autoFillDealCosts(dealId: string): Promise<void> {
  if (!supabase) return;

  const { data: dealRow } = await supabase
    .from('deals')
    .select('value, ficha_cliente, custo_nf, custo_nf_tipo, custo_art, custo_engenharia, custo_corrugado, custo_eletroduto, custo_fornecedor, custos_extras, comissao_valor')
    .eq('id', dealId)
    .maybeSingle();

  if (!dealRow) return;
  const row = dealRow as any;

  const valorVenda = Number(row.value ?? 0);
  if (valorVenda <= 0) return;

  const fichaCliente = row.ficha_cliente as Record<string, any> | null;
  const kwp = Number(fichaCliente?.potenciaKwp ?? 0);

  const exNf = Number(row.custo_nf ?? 0);
  const exArt = Number(row.custo_art ?? 0);
  const exEng = Number(row.custo_engenharia ?? 0);
  const exCorrugado = Number(row.custo_corrugado ?? 0);
  const exEletroduto = Number(row.custo_eletroduto ?? 0);
  const exFornecedor = Number(row.custo_fornecedor ?? 0);
  const exExtras: { descricao: string; valor: number }[] = Array.isArray(row.custos_extras) ? row.custos_extras : [];
  const exComissao = Number(row.comissao_valor ?? 0);
  const nfTipo = (row.custo_nf_tipo === 'servico' ? 'servico' : 'kit') as 'kit' | 'servico';

  const { data: cfg } = await orgSettingsService.getCostSettings();
  if (!cfg) return;

  // Usa valor existente quando preenchido; caso contrário aplica padrão da org
  const custoEngenharia = exEng > 0 ? exEng : calcEngCost(kwp, cfg);
  const custoArt = exArt > 0 ? exArt : cfg.custoArt;
  const custoCorrugado = exCorrugado > 0 ? exCorrugado : cfg.custoCorrugado;
  const custoEletroduto = exEletroduto > 0 ? exEletroduto : cfg.custoEletroduto;
  const custoNf = exNf > 0 ? exNf : calcNfCost(valorVenda, nfTipo, cfg, exFornecedor);

  const comissaoPct = calcComissaoPct(kwp, cfg);
  const comissaoValor = exComissao > 0 ? exComissao : valorVenda * (comissaoPct / 100);

  const somaExtras = exExtras.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const custoTotal = custoNf + custoArt + custoEngenharia + custoCorrugado + custoEletroduto + exFornecedor + comissaoValor + somaExtras;
  const lucroBruto = valorVenda - custoTotal;
  const margemPct = valorVenda > 0 ? (lucroBruto / valorVenda) * 100 : 0;

  await dealCostsService.updateCosts(dealId, {
    custoNf,
    custoNfTipo: nfTipo,
    custoArt,
    custoEngenharia,
    custoCorrugado,
    custoEletroduto,
    custoFornecedor: exFornecedor,
    custosExtras: exExtras,
    custoTotal,
    comissaoValor,
    lucroBruto,
    margemPct,
  });
}
