'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText, Pencil, Search, Loader2, RefreshCw, Zap, X,
  DollarSign, TrendingUp, Plus, CheckCircle2, AlertCircle,
} from 'lucide-react';
import {
  calcDealCosts, calcComissaoPct, calcNfCost, calcEngCost,
  DealCostData,
} from '@/lib/supabase/dealCosts';
import { orgSettingsService, OrgCostSettings } from '@/lib/supabase/orgSettings';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { supabase } from '@/lib/supabase/client';

interface OrcafacilProposal {
  id: string;
  cliente_nome: string;
  cliente_cidade: string | null;
  potencia_kwp: number | null;
  valor_final: number | null;
  forma_pagamento: string | null;
  crm_deal_id: string | null;
  created_at: string;
  // Campos de custo do OrçaFácil (preenchidos ao gerar o orçamento)
  custo_nf: number | null;
  custo_engenharia: number | null;
  custo_instalacao: number | null;
  custo_corrugado: number | null;
  custo_eletroduto: number | null;
  custo_fornecedor: number | null;
  custos_extras: { descricao: string; valor: number }[] | null;
  custo_total: number | null;
  comissao_valor: number | null;
  lucro_bruto: number | null;
  margem_pct: number | null;
}

function fmtBRL(v: number | null | undefined) {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function pct(v: number) { return `${v.toFixed(1)}%`; }

const ORCAFACIL_BASE = 'https://app-eight-eta-92.vercel.app';
const inputCls = 'w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:ring-1 focus:ring-cyan-500/30';

const defaultCosts: DealCostData = {
  custoNf: 0, custoNfTipo: 'servico', custoEngenharia: 0, custoInstalacao: 0,
  custoCorrugado: 0, custoEletroduto: 0, custoFornecedor: 0, voucherBancoPct: 0,
  custosExtras: [], custoTotal: 0, comissaoValor: 0, lucroBruto: 0, margemPct: 0,
  custosPagos: {}, vendaPropria: true,
};

/* ──────────────────────────────────────────────────────────────────────
   Converte campos de custo do OrçaFácil → DealCostData (fallback)
────────────────────────────────────────────────────────────────────── */
function proposalToCosts(p: OrcafacilProposal): DealCostData | null {
  // Retorna null se nenhum custo foi preenchido no OrçaFácil
  const temCusto = (p.custo_engenharia ?? 0) > 0
    || (p.custo_instalacao ?? 0) > 0
    || (p.custo_fornecedor ?? 0) > 0
    || (p.custo_corrugado ?? 0) > 0
    || (p.custo_eletroduto ?? 0) > 0;
  if (!temCusto) return null;
  return {
    custoNf: Number(p.custo_nf ?? 0),
    custoNfTipo: 'servico',
    custoEngenharia: Number(p.custo_engenharia ?? 0),
    custoInstalacao: Number(p.custo_instalacao ?? 0),
    custoCorrugado: Number(p.custo_corrugado ?? 0),
    custoEletroduto: Number(p.custo_eletroduto ?? 0),
    custoFornecedor: Number(p.custo_fornecedor ?? 0),
    voucherBancoPct: 0,
    custosExtras: Array.isArray(p.custos_extras) ? p.custos_extras : [],
    custoTotal: Number(p.custo_total ?? 0),
    comissaoValor: Number(p.comissao_valor ?? 0),
    lucroBruto: Number(p.lucro_bruto ?? 0),
    margemPct: Number(p.margem_pct ?? 0),
    custosPagos: {},
    vendaPropria: false,
  };
}

/* ──────────────────────────────────────────────────────────────────────
   Converte linha do banco → DealCostData
────────────────────────────────────────────────────────────────────── */
function rowToCosts(row: Record<string, unknown>): DealCostData {
  return {
    custoNf: Number(row.custo_nf ?? 0),
    custoNfTipo: (['kit', 'servico', 'cliente'].includes(row.custo_nf_tipo as string)
      ? row.custo_nf_tipo : 'servico') as 'kit' | 'servico' | 'cliente',
    custoEngenharia: Number(row.custo_engenharia ?? 0),
    custoInstalacao: Number(row.custo_instalacao ?? 0),
    custoCorrugado: Number(row.custo_corrugado ?? 0),
    custoEletroduto: Number(row.custo_eletroduto ?? 0),
    custoFornecedor: Number(row.custo_fornecedor ?? 0),
    voucherBancoPct: Number(row.voucher_banco_pct ?? 0),
    custosExtras: Array.isArray(row.custos_extras) ? row.custos_extras as { descricao: string; valor: number }[] : [],
    custoTotal: Number(row.custo_total ?? 0),
    comissaoValor: Number(row.comissao_valor ?? 0),
    lucroBruto: Number(row.lucro_bruto ?? 0),
    margemPct: Number(row.margem_pct ?? 0),
    custosPagos: {},
    vendaPropria: row.venda_propria === true,
  };
}

/* ──────────────────────────────────────────────────────────────────────
   Modal de custos (editável)
────────────────────────────────────────────────────────────────────── */
interface CustosModalProps {
  proposal: OrcafacilProposal;
  onClose: () => void;
}

function CustosModal({ proposal, onClose }: CustosModalProps) {
  const [costs, setCosts] = useState<DealCostData>(defaultCosts);
  const [orgCfg, setOrgCfg] = useState<OrgCostSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [newExtraDesc, setNewExtraDesc] = useState('');
  const [newExtraValor, setNewExtraValor] = useState('');

  const valorVenda = proposal.valor_final ?? 0;
  const kwp = proposal.potencia_kwp ?? 0;
  const comissaoPct = costs.vendaPropria ? 0 : (orgCfg ? calcComissaoPct(kwp, orgCfg) : 0);

  const recalc = useCallback((base: DealCostData, cfg: OrgCostSettings | null): DealCostData => {
    if (!cfg) return base;
    const custoFornecedorEfetivo = base.custoFornecedor * (1 - (base.voucherBancoPct ?? 0) / 100);
    const nf = calcNfCost(valorVenda, base.custoNfTipo, cfg, custoFornecedorEfetivo);
    const comPct = base.vendaPropria ? 0 : calcComissaoPct(kwp, cfg);
    const totals = calcDealCosts({ ...base, custoNf: nf }, valorVenda, comPct);
    return { ...base, custoNf: nf, ...totals };
  }, [valorVenda, kwp]);

  // Carrega custos: se tem crm_deal_id usa o deal, senão busca orcamento_costs
  useEffect(() => {
    void (async () => {
      const cfgRes = await orgSettingsService.getCostSettings();
      const cfg = cfgRes.data ?? null;
      if (cfg) setOrgCfg(cfg);

      if (proposal.crm_deal_id) {
        // Busca da tabela deals (negócio vinculado)
        const { dealCostsService } = await import('@/lib/supabase/dealCosts');
        const res = await dealCostsService.getCosts(proposal.crm_deal_id);
        setCosts(recalc(res.data ?? defaultCosts, cfg));
      } else {
        // 1º: busca orcamento_costs via client-side Supabase (evita problemas de auth no servidor)
        const { data: profile } = await supabase
          .from('profiles').select('organization_id').single();
        const orgId = profile?.organization_id;

        if (orgId) {
          const { data: row } = await supabase
            .from('orcamento_costs')
            .select('*')
            .eq('organization_id', orgId)
            .eq('orcamento_id', proposal.id)
            .maybeSingle();

          if (row) {
            setCosts(recalc(rowToCosts(row as Record<string, unknown>), cfg));
          } else {
            // 2º fallback: custos do OrçaFácil
            const fromOrcafacil = proposalToCosts(proposal);
            setCosts(recalc(fromOrcafacil ?? defaultCosts, cfg));
          }
        } else {
          setCosts(recalc(proposalToCosts(proposal) ?? defaultCosts, cfg));
        }
      }
      setLoading(false);
    })();
  }, [proposal, recalc]);

  const setNfTipo = (tipo: 'kit' | 'servico' | 'cliente') =>
    setCosts(prev => recalc({ ...prev, custoNfTipo: tipo }, orgCfg));

  const setField = (key: keyof DealCostData) => (val: number) =>
    setCosts(prev => recalc({ ...prev, [key]: val }, orgCfg));

  const aplicarPadroes = () => {
    if (!orgCfg) return;
    setCosts(prev => recalc({
      ...prev,
      custoEngenharia: calcEngCost(kwp, orgCfg),
      custoInstalacao: kwp * (orgCfg.custoInstalacaoPorKwp ?? 190),
      custoCorrugado: orgCfg.custoCorrugado,
      custoEletroduto: orgCfg.custoEletroduto,
    }, orgCfg));
  };

  const adicionarExtra = () => {
    const desc = newExtraDesc.trim();
    const valor = parseFloat(newExtraValor.replace(',', '.')) || 0;
    if (!desc) return;
    setCosts(prev => recalc({ ...prev, custosExtras: [...prev.custosExtras, { descricao: desc, valor }] }, orgCfg));
    setNewExtraDesc('');
    setNewExtraValor('');
  };

  const removerExtra = (idx: number) =>
    setCosts(prev => recalc({ ...prev, custosExtras: prev.custosExtras.filter((_, i) => i !== idx) }, orgCfg));

  const salvar = async () => {
    setSaving(true);
    setSaveError(null);
    const final = recalc(costs, orgCfg);
    setCosts(final);

    try {
      if (proposal.crm_deal_id) {
        const { dealCostsService } = await import('@/lib/supabase/dealCosts');
        const { error } = await dealCostsService.updateCosts(proposal.crm_deal_id, final);
        if (error) throw error;
      } else {
        const { data: profile } = await supabase
          .from('profiles').select('organization_id').single();
        const orgId = profile?.organization_id;
        if (!orgId) throw new Error('Usuário sem organização');

        const { error } = await supabase.from('orcamento_costs').upsert({
          organization_id: orgId,
          orcamento_id: proposal.id,
          custo_nf: final.custoNf,
          custo_nf_tipo: final.custoNfTipo,
          custo_engenharia: final.custoEngenharia,
          custo_instalacao: final.custoInstalacao,
          custo_corrugado: final.custoCorrugado,
          custo_eletroduto: final.custoEletroduto,
          custo_fornecedor: final.custoFornecedor,
          voucher_banco_pct: final.voucherBancoPct,
          custos_extras: final.custosExtras,
          custo_total: final.custoTotal,
          comissao_valor: final.comissaoValor,
          lucro_bruto: final.lucroBruto,
          margem_pct: final.margemPct,
          venda_propria: final.vendaPropria,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'organization_id,orcamento_id' });

        if (error) throw error;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setSaveError(e?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const margemColor = costs.margemPct >= 20
    ? 'text-emerald-400' : costs.margemPct >= 10
    ? 'text-amber-400' : 'text-rose-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-dark-card border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/10 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-orange-400 shrink-0" />
              <h2 className="text-sm font-semibold text-white truncate">Custos Internos</h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 truncate">{proposal.cliente_nome}</p>
            {valorVenda > 0 && (
              <p className="text-xs text-slate-500 mt-0.5">
                Venda: <span className="text-slate-300">{fmtBRL(valorVenda)}</span>
                {kwp > 0 && <span className="ml-2">{kwp} kWp</span>}
              </p>
            )}
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Conteúdo rolável */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {loading ? (
            <div className="py-12 flex flex-col items-center gap-2 text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-xs">Carregando...</span>
            </div>
          ) : (
            <>
              {/* Toggle Própria / Vendedor */}
              <div className="flex gap-1.5">
                {([
                  { value: false, label: 'Por vendedor' },
                  { value: true,  label: 'Venda própria' },
                ] as const).map(({ value, label }) => (
                  <button key={String(value)} type="button"
                    onClick={() => setCosts(prev => recalc({ ...prev, vendaPropria: value }, orgCfg))}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-[10px] font-semibold transition-colors ${
                      costs.vendaPropria === value
                        ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200'
                        : 'border-white/10 bg-white/3 text-slate-400 hover:bg-white/5'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Aplicar padrões */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Custos internos</span>
                <button type="button" onClick={aplicarPadroes}
                  className="rounded-lg border border-white/10 bg-white/3 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:bg-white/5">
                  Aplicar padrões
                </button>
              </div>

              {/* Tipo NF */}
              <div>
                <div className="text-[10px] text-slate-500 mb-1.5">Tipo de NF</div>
                <div className="flex gap-1.5">
                  {([
                    { value: 'kit', label: `Kit total (${pct(orgCfg?.custoNfKitPct ?? 4)})` },
                    { value: 'servico', label: `Serviço s/ kit (${pct(orgCfg?.custoNfServicoPct ?? 6)})` },
                    { value: 'cliente', label: `NF ao cliente (${pct(orgCfg?.custoNfServicoPct ?? 6)})` },
                  ] as const).map(({ value, label }) => (
                    <button key={value} type="button" onClick={() => setNfTipo(value)}
                      className={`flex-1 rounded-lg border px-1.5 py-1.5 text-[10px] font-semibold transition-colors ${
                        costs.custoNfTipo === value
                          ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200'
                          : 'border-white/10 bg-white/3 text-slate-400 hover:bg-white/5'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-1 text-[10px] text-slate-500">
                  NF calculada: <span className="text-slate-300">{fmtBRL(costs.custoNf)}</span>
                </div>
              </div>

              {/* Campos de custo */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {([
                  { key: 'custoEngenharia' as const, label: `Engenharia${kwp ? ` (${kwp} kWp)` : ''}` },
                  { key: 'custoInstalacao' as const, label: `Instalação${kwp && orgCfg ? ` (R$${orgCfg.custoInstalacaoPorKwp}/kWp)` : ''}` },
                  { key: 'custoCorrugado' as const, label: 'Corrugado' },
                  { key: 'custoEletroduto' as const, label: 'Eletroduto' },
                  { key: 'custoFornecedor' as const, label: 'Fornecedora' },
                ]).map(({ key, label }) => (
                  <div key={key}>
                    <div className="text-[10px] text-slate-500 mb-0.5">{label}</div>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">R$</span>
                      <MoneyInput value={costs[key] as number} onChange={setField(key)} className={inputCls + ' pl-6'} placeholder="0" min={0} />
                    </div>
                  </div>
                ))}
                <div>
                  <div className="text-[10px] text-slate-500 mb-0.5">Voucher banco (%)</div>
                  <div className="relative">
                    <input
                      type="number" min={0} max={100} step={0.1}
                      value={costs.voucherBancoPct || ''}
                      onChange={e => setCosts(prev => recalc({ ...prev, voucherBancoPct: parseFloat(e.target.value) || 0 }, orgCfg))}
                      placeholder="0"
                      className={inputCls + ' pr-6'}
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">%</span>
                  </div>
                  {costs.voucherBancoPct > 0 && (
                    <div className="text-[10px] text-emerald-400 mt-0.5">
                      − {fmtBRL(costs.custoFornecedor * costs.voucherBancoPct / 100)}
                    </div>
                  )}
                </div>
              </div>

              {/* Extras */}
              <div>
                <div className="text-[10px] text-slate-500 mb-1.5">Custos extras</div>
                {costs.custosExtras.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 mb-1 text-xs">
                    <span className="flex-1 truncate text-slate-300">{e.descricao}</span>
                    <span className="text-slate-400 shrink-0">{fmtBRL(e.valor)}</span>
                    <button type="button" onClick={() => removerExtra(i)}
                      className="rounded p-0.5 text-rose-400 hover:bg-rose-500/10">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-1.5 mt-1.5">
                  <input value={newExtraDesc} onChange={e => setNewExtraDesc(e.target.value)}
                    placeholder="Descrição" className={inputCls + ' flex-1'}
                    onKeyDown={e => e.key === 'Enter' && adicionarExtra()} />
                  <div className="relative w-20 shrink-0">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">R$</span>
                    <input type="text" inputMode="decimal" value={newExtraValor}
                      onChange={e => setNewExtraValor(e.target.value.replace(/[^\d,\.]/g, ''))}
                      placeholder="0" className={inputCls + ' pl-6'}
                      onKeyDown={e => e.key === 'Enter' && adicionarExtra()} />
                  </div>
                  <button type="button" onClick={adicionarExtra}
                    className="rounded-lg border border-white/10 bg-white/3 p-1.5 text-slate-300 hover:bg-white/5">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Resumo */}
              <div className="rounded-xl border border-white/10 bg-white/3 p-3 space-y-1.5">
                <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  <TrendingUp className="h-3 w-3" /> Resumo
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Valor de venda</span>
                  <span className="text-slate-200">{fmtBRL(valorVenda)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Custo total</span>
                  <span className="text-rose-300">{fmtBRL(costs.custoTotal)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Comissão ({pct(comissaoPct)})</span>
                  <span className="text-amber-300">{fmtBRL(costs.comissaoValor)}</span>
                </div>
                <div className="border-t border-white/10 pt-1.5 flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-300">Lucro bruto</span>
                  <span className={margemColor}>
                    {fmtBRL(costs.lucroBruto)} <span className="font-normal text-[10px]">({pct(costs.margemPct)})</span>
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Rodapé fixo */}
        {!loading && (
          <div className="px-5 py-3 border-t border-white/10 shrink-0 space-y-2">
            {saveError && (
              <div className="flex items-center gap-1.5 text-xs text-rose-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {saveError}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button type="button" onClick={salvar} disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50 transition-colors">
                {saving
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando...</>
                  : saved
                  ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Salvo!</>
                  : 'Salvar custos'}
              </button>
              <button onClick={onClose}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Página principal
────────────────────────────────────────────────────────────────────── */
export function OrcamentosPage() {
  const [proposals, setProposals] = useState<OrcafacilProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedProposal, setSelectedProposal] = useState<OrcafacilProposal | null>(null);

  const fetchProposals = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/orcafacil/list');
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setProposals(json.orcamentos ?? []);
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar orçamentos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProposals(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return proposals;
    const q = search.toLowerCase();
    return proposals.filter(p =>
      (p.cliente_nome || '').toLowerCase().includes(q) ||
      (p.cliente_cidade || '').toLowerCase().includes(q)
    );
  }, [proposals, search]);

  return (
    <div className="min-h-screen bg-dark text-white">
      {selectedProposal && (
        <CustosModal proposal={selectedProposal} onClose={() => setSelectedProposal(null)} />
      )}

      {/* Header */}
      <div className="border-b border-white/10 bg-dark-card/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-white flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary-400" />
              Orçamentos
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Clique na linha para ver e editar custos internos
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchProposals} disabled={loading}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <a href={`${ORCAFACIL_BASE}/dashboard`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 bg-orange-500 hover:bg-orange-400 text-white rounded-xl text-sm font-semibold transition-colors">
              <Zap className="h-4 w-4" />
              Novo no OrçaFácil
            </a>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por cliente ou cidade..."
              className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40" />
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {loading ? (
          <div className="py-20 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
            <p className="text-slate-400 text-sm">Carregando orçamentos...</p>
          </div>
        ) : error ? (
          <div className="py-20 text-center">
            <p className="text-red-400 text-sm mb-3">{error}</p>
            <button onClick={fetchProposals} className="text-xs text-slate-400 hover:text-white underline">Tentar novamente</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <FileText className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">
              {search ? 'Nenhum resultado.' : 'Nenhum orçamento encontrado.'}
            </p>
          </div>
        ) : (
          <div className="bg-dark-card rounded-2xl border border-white/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <span className="text-xs text-slate-400">{filtered.length} orçamento{filtered.length !== 1 ? 's' : ''}</span>
              <span className="text-xs text-slate-500">Clique para editar custos internos</span>
            </div>
            <div className="divide-y divide-white/5">
              {filtered.map(p => (
                <div key={p.id} onClick={() => setSelectedProposal(p)}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition-colors group cursor-pointer">
                  <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-orange-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{p.cliente_nome || '—'}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      {p.cliente_cidade && <span className="text-xs text-slate-400">{p.cliente_cidade}</span>}
                      {p.potencia_kwp != null && p.potencia_kwp > 0 && (
                        <span className="text-xs text-slate-500">{p.potencia_kwp} kWp</span>
                      )}
                      {p.forma_pagamento && (
                        <span className="text-xs text-slate-500 truncate max-w-[160px]">{p.forma_pagamento}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0 hidden sm:block">
                    <p className="text-sm font-mono font-medium text-white">{fmtBRL(p.valor_final)}</p>
                    <p className="text-[11px] text-slate-500">{fmtDate(p.created_at)}</p>
                  </div>
                  <a href={`${ORCAFACIL_BASE}/orcamento/${p.id}`} target="_blank" rel="noopener noreferrer"
                    title="Editar no OrçaFácil" onClick={e => e.stopPropagation()}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-lg text-xs font-medium hover:bg-orange-500/20 hover:text-orange-300 transition-colors">
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
