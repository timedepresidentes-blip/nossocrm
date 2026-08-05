'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, DollarSign, Loader2, Plus, TrendingUp, X } from 'lucide-react';
import { dealCostsService, calcDealCosts, calcEngCost, calcComissaoPct, calcNfCost, DealCostData } from '@/lib/supabase/dealCosts';
import { orgSettingsService, OrgCostSettings } from '@/lib/supabase/orgSettings';
import { MoneyInput } from '@/components/ui/MoneyInput';

interface Props {
  dealId: string;
  valorVenda: number;
  kwp?: number;
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
const PCT = (v: number) => `${v.toFixed(1)}%`;

const inputCls = 'w-full rounded-lg border border-white/10 bg-white/3 px-2.5 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:ring-1 focus:ring-cyan-500/30';

const defaultCosts: DealCostData = {
  custoNf: 0, custoNfTipo: 'kit', custoArt: 0, custoEngenharia: 0,
  custoCorrugado: 0, custoEletroduto: 0, custoFornecedor: 0,
  custosExtras: [], custoTotal: 0, comissaoValor: 0, lucroBruto: 0, margemPct: 0,
};

export const DealCostsPanel: React.FC<Props> = ({ dealId, valorVenda, kwp }) => {
  const [costs, setCosts] = useState<DealCostData>(defaultCosts);
  const [orgCfg, setOrgCfg] = useState<OrgCostSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newExtraDesc, setNewExtraDesc] = useState('');
  const [newExtraValor, setNewExtraValor] = useState('');

  const recalc = useCallback((base: DealCostData, cfg: OrgCostSettings | null): DealCostData => {
    if (!cfg) return base;
    const nf = calcNfCost(valorVenda, base.custoNfTipo, cfg, base.custoFornecedor);
    const totals = calcDealCosts({ ...base, custoNf: nf }, valorVenda, calcComissaoPct(kwp ?? 0, cfg));
    return { ...base, custoNf: nf, ...totals };
  }, [valorVenda, kwp]);

  const load = useCallback(async () => {
    setLoading(true);
    const [costsRes, cfgRes] = await Promise.all([
      dealCostsService.getCosts(dealId),
      orgSettingsService.getCostSettings(),
    ]);
    const loadedCfg = cfgRes.data ?? null;
    const loadedCosts = costsRes.data ?? defaultCosts;
    if (loadedCfg) setOrgCfg(loadedCfg);
    // Recalcula totais ao carregar para corrigir custo_total/margem que podem estar 0 no banco
    setCosts(recalc(loadedCosts, loadedCfg));
    setLoading(false);
  }, [dealId, recalc]);

  useEffect(() => { void load(); }, [load]);

  const comissaoPct = orgCfg ? calcComissaoPct(kwp ?? 0, orgCfg) : 0;

  const aplicarPadroes = useCallback(() => {
    if (!orgCfg) return;
    const kwpVal = kwp ?? 0;
    setCosts((prev) => {
      const next: DealCostData = {
        ...prev,
        custoEngenharia: calcEngCost(kwpVal, orgCfg),
        custoArt: orgCfg.custoArt,
        custoCorrugado: orgCfg.custoCorrugado,
        custoEletroduto: orgCfg.custoEletroduto,
      };
      return recalc(next, orgCfg);
    });
  }, [orgCfg, kwp, recalc]);

  const setNfTipo = (tipo: 'kit' | 'servico') => {
    setCosts((prev) => recalc({ ...prev, custoNfTipo: tipo }, orgCfg));
  };

  const setField = (key: keyof DealCostData) => (val: number) => {
    setCosts((prev) => recalc({ ...prev, [key]: val }, orgCfg));
  };

  const adicionarExtra = () => {
    const desc = newExtraDesc.trim();
    const valor = parseFloat(newExtraValor.replace(',', '.')) || 0;
    if (!desc) return;
    setCosts((prev) => {
      const extras = [...prev.custosExtras, { descricao: desc, valor }];
      return recalc({ ...prev, custosExtras: extras }, orgCfg);
    });
    setNewExtraDesc('');
    setNewExtraValor('');
  };

  const removerExtra = (idx: number) => {
    setCosts((prev) => {
      const extras = prev.custosExtras.filter((_, i) => i !== idx);
      return recalc({ ...prev, custosExtras: extras }, orgCfg);
    });
  };

  const salvar = async () => {
    setSaving(true);
    setSaved(false);
    // Força recálculo dos totais antes de salvar para garantir custo_total/margem corretos
    const finalCosts = recalc(costs, orgCfg);
    setCosts(finalCosts);
    const { error } = await dealCostsService.updateCosts(dealId, finalCosts);
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    setSaving(false);
  };

  const margemColor = costs.margemPct >= 20 ? 'text-emerald-400' : costs.margemPct >= 10 ? 'text-amber-400' : 'text-rose-400';

  if (loading) return (
    <div className="rounded-xl border border-white/10 bg-white/2 p-3 flex items-center gap-2 text-xs text-slate-500">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando custos...
    </div>
  );

  return (
    <div className="rounded-xl border border-white/10 bg-white/2 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <DollarSign className="h-3.5 w-3.5" /> Custos Internos
        </div>
        <button type="button" onClick={aplicarPadroes}
          className="rounded-lg border border-white/10 bg-white/3 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:bg-white/5"
          title="Preenche com os padrões configurados">
          Aplicar padrões
        </button>
      </div>

      {/* Tipo de NF */}
      <div>
        <div className="text-[10px] text-slate-500 mb-1">Tipo de NF</div>
        <div className="flex gap-2">
          {(['kit', 'servico'] as const).map((tipo) => (
            <button key={tipo} type="button" onClick={() => setNfTipo(tipo)}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-[10px] font-semibold transition-colors ${
                costs.custoNfTipo === tipo
                  ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200'
                  : 'border-white/10 bg-white/3 text-slate-400 hover:bg-white/5'
              }`}>
              {tipo === 'kit'
                ? `Kit total (${PCT(orgCfg?.custoNfKitPct ?? 4)})`
                : `Só serviço (${PCT(orgCfg?.custoNfServicoPct ?? 6)})`}
            </button>
          ))}
        </div>
        <div className="mt-1 text-[10px] text-slate-500">NF calculada: <span className="text-slate-300">{BRL.format(costs.custoNf)}</span></div>
      </div>

      {/* Campos de custo */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {([
          { key: 'custoArt' as const, label: 'ART Engenharia' },
          { key: 'custoEngenharia' as const, label: `Engenharia${kwp ? ` (${kwp} kWp)` : ''}` },
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
      </div>

      {/* Extras */}
      <div>
        <div className="text-[10px] text-slate-500 mb-1.5">Custos extras</div>
        {costs.custosExtras.map((e, i) => (
          <div key={i} className="flex items-center justify-between gap-2 mb-1 text-xs">
            <span className="flex-1 truncate text-slate-300">{e.descricao}</span>
            <span className="text-slate-400 shrink-0">{BRL.format(e.valor)}</span>
            <button type="button" onClick={() => removerExtra(i)} className="rounded p-0.5 text-rose-400 hover:bg-rose-500/10">
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <div className="flex gap-1.5 mt-1.5">
          <input value={newExtraDesc} onChange={(e) => setNewExtraDesc(e.target.value)}
            placeholder="Descrição" className={inputCls + ' flex-1'}
            onKeyDown={(e) => e.key === 'Enter' && adicionarExtra()} />
          <div className="relative w-20 shrink-0">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">R$</span>
            <input type="text" inputMode="decimal" value={newExtraValor}
              onChange={(e) => setNewExtraValor(e.target.value.replace(/[^\d,\.]/g, ''))}
              placeholder="0" className={inputCls + ' pl-6'}
              onKeyDown={(e) => e.key === 'Enter' && adicionarExtra()} />
          </div>
          <button type="button" onClick={adicionarExtra}
            className="rounded-lg border border-white/10 bg-white/3 p-1.5 text-slate-300 hover:bg-white/5">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Resumo */}
      <div className="rounded-lg border border-white/10 bg-white/3 p-2.5 space-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500">Valor de venda</span>
          <span className="text-slate-200">{BRL.format(valorVenda)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500">Custo total</span>
          <span className="text-rose-300">{BRL.format(costs.custoTotal)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500">Comissão ({PCT(comissaoPct)})</span>
          <span className="text-amber-300">{BRL.format(costs.comissaoValor)}</span>
        </div>
        <div className="border-t border-white/10 pt-1.5 flex items-center justify-between gap-2">
          <span className="font-semibold text-slate-300 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Lucro bruto
          </span>
          <span className={`font-semibold ${margemColor}`}>
            {BRL.format(costs.lucroBruto)} <span className="text-[10px]">({PCT(costs.margemPct)})</span>
          </span>
        </div>
      </div>

      <button type="button" onClick={salvar} disabled={saving}
        className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-50">
        {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando...</>
          : saved ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Salvo!</>
          : 'Salvar custos'}
      </button>
    </div>
  );
};
