'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, DollarSign, Loader2 } from 'lucide-react';
import { orgSettingsService, OrgCostSettings } from '@/lib/supabase/orgSettings';
import { Button } from '@/components/ui/button';
import { MoneyInput } from '@/components/ui/MoneyInput';

const defaults: OrgCostSettings = {
  custoArt: 0,
  custoNfKitPct: 4,
  custoNfServicoPct: 6,
  custoEng1a3kwp: 350,
  custoEng3a5kwp: 450,
  custoEngAcima5kwp: 600,
  custoCorrugado: 0,
  custoEletroduto: 0,
  custoComissaoPct: 5,
  custoComissaoAcima5kwpPct: 7,
};

export const CostSettingsSection: React.FC = () => {
  const [form, setForm] = useState<OrgCostSettings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    orgSettingsService.getCostSettings().then(({ data, error }) => {
      if (data) setForm(data);
      if (error) setError(error.message);
      setLoading(false);
    });
  }, []);

  const setNum = (key: keyof OrgCostSettings) => (val: number) =>
    setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    const { error } = await orgSettingsService.updateCostSettings(form);
    if (error) setError(error.message);
    else { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    setSaving(false);
  };

  const inp = 'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40';
  const lbl = 'block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1';
  const hint = 'text-[11px] text-slate-400 mt-1';
  const sec = 'text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3';

  if (loading) return (
    <div className="mb-12">
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6 flex items-center gap-3 text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando configurações de custo...
      </div>
    </div>
  );

  return (
    <div className="mb-12">
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6 space-y-6">
        <div className="flex items-start gap-3">
          <DollarSign className="h-5 w-5 text-primary-500 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Custos Padrão (Controle Interno)</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Valores padrão aplicados automaticamente ao abrir "Gerar Proposta". Visíveis apenas no CRM.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
            {error}
          </div>
        )}

        {/* Nota Fiscal */}
        <div>
          <div className={sec}>Nota Fiscal</div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Escolha os percentuais para cada tipo de NF. Ao gerar a proposta, você seleciona qual emitir.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>NF — Total do kit solar (%)</label>
              <div className="relative">
                <MoneyInput value={form.custoNfKitPct} onChange={setNum('custoNfKitPct')} min={0} max={100} className={inp} placeholder="4" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
              </div>
              <p className={hint}>% aplicado ao valor total da nota fiscal (kit + serviço).</p>
            </div>
            <div>
              <label className={lbl}>NF — Somente serviço (%)</label>
              <div className="relative">
                <MoneyInput value={form.custoNfServicoPct} onChange={setNum('custoNfServicoPct')} min={0} max={100} className={inp} placeholder="6" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
              </div>
              <p className={hint}>% aplicado sobre a diferença entre o valor final vendido ao cliente e o custo do fornecedor. Ex.: venda R$28.000 – fornecedor R$20.000 = R$8.000 × 6% = R$480.</p>
            </div>
          </div>
        </div>

        {/* Engenharia */}
        <div>
          <div className={sec}>Engenharia</div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            O custo é selecionado automaticamente pela faixa de kWp do projeto.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className={lbl}>1 a 2,99 kWp</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">R$</span>
                <MoneyInput value={form.custoEng1a3kwp} onChange={setNum('custoEng1a3kwp')} min={0} className={inp + ' pl-8'} placeholder="350" />
              </div>
            </div>
            <div>
              <label className={lbl}>3 a 4,99 kWp</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">R$</span>
                <MoneyInput value={form.custoEng3a5kwp} onChange={setNum('custoEng3a5kwp')} min={0} className={inp + ' pl-8'} placeholder="450" />
              </div>
            </div>
            <div>
              <label className={lbl}>Acima de 5 kWp</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">R$</span>
                <MoneyInput value={form.custoEngAcima5kwp} onChange={setNum('custoEngAcima5kwp')} min={0} className={inp + ' pl-8'} placeholder="600" />
              </div>
            </div>
          </div>
          <div className="max-w-xs">
            <label className={lbl}>ART de Engenharia (fixo por projeto)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">R$</span>
              <MoneyInput value={form.custoArt} onChange={setNum('custoArt')} min={0} className={inp + ' pl-8'} placeholder="0" />
            </div>
            <p className={hint}>Custo fixo da Anotação de Responsabilidade Técnica por projeto.</p>
          </div>
        </div>

        {/* Infraestrutura */}
        <div>
          <div className={sec}>Infraestrutura</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Corrugado (por orçamento)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">R$</span>
                <MoneyInput value={form.custoCorrugado} onChange={setNum('custoCorrugado')} min={0} className={inp + ' pl-8'} placeholder="0" />
              </div>
            </div>
            <div>
              <label className={lbl}>Eletroduto (por orçamento)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">R$</span>
                <MoneyInput value={form.custoEletroduto} onChange={setNum('custoEletroduto')} min={0} className={inp + ' pl-8'} placeholder="0" />
              </div>
            </div>
          </div>
        </div>

        {/* Comissão */}
        <div>
          <div className={sec}>Comissão</div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Comissão selecionada automaticamente pelo kWp. Pode ser ajustada manualmente por deal.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Comissão padrão (até 4,99 kWp)</label>
              <div className="relative">
                <MoneyInput value={form.custoComissaoPct} onChange={setNum('custoComissaoPct')} min={0} max={100} className={inp} placeholder="5" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
              </div>
            </div>
            <div>
              <label className={lbl}>Comissão acima de 5 kWp (vendedor)</label>
              <div className="relative">
                <MoneyInput value={form.custoComissaoAcima5kwpPct} onChange={setNum('custoComissaoAcima5kwpPct')} min={0} max={100} className={inp} placeholder="7" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
              </div>
              <p className={hint}>Aplicado automaticamente para sistemas ≥ 5 kWp.</p>
            </div>
          </div>
        </div>

        <Button type="button" onClick={handleSave} disabled={saving} size="sm" className="flex items-center gap-2">
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
          ) : saved ? (
            <><CheckCircle2 className="w-4 h-4 text-green-400" /> Salvo!</>
          ) : (
            'Salvar configurações de custo'
          )}
        </Button>
      </div>
    </div>
  );
};
