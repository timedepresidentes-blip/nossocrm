'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, FileText, Loader2 } from 'lucide-react';
import { orgSettingsService, OrgQuoteSettings } from '@/lib/supabase/orgSettings';
import { Button } from '@/components/ui/button';

export const QuoteSettingsSection: React.FC = () => {
  const [form, setForm] = useState<OrgQuoteSettings>({
    logoUrl: '',
    companyPhone: '',
    companyEmail: '',
    companyAddress: '',
    quoteFooter: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    orgSettingsService.getQuoteSettings().then(({ data, error }) => {
      if (data) setForm(data);
      if (error) setError(error.message);
      setLoading(false);
    });
  }, []);

  const set = (key: keyof OrgQuoteSettings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    const { error } = await orgSettingsService.updateQuoteSettings(form);
    if (error) setError(error.message);
    else { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    setSaving(false);
  };

  const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40';

  if (loading) return (
    <div className="mb-12">
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6 flex items-center gap-3 text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando configurações...
      </div>
    </div>
  );

  return (
    <div className="mb-12">
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6 space-y-4">
        <div className="flex items-start gap-3 mb-2">
          <FileText className="h-5 w-5 text-primary-500 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Configurações de Orçamento</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Dados da empresa exibidos no cabeçalho e rodapé dos orçamentos gerados.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              URL do Logotipo
            </label>
            <input
              value={form.logoUrl}
              onChange={set('logoUrl')}
              placeholder="https://suaempresa.com/logo.png"
              className={inputCls}
            />
            <p className="text-[11px] text-slate-400 mt-1">Informe a URL pública de uma imagem (PNG, SVG). Aparece no topo do orçamento.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Telefone</label>
            <input value={form.companyPhone} onChange={set('companyPhone')} placeholder="(16) 99999-0000" className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">E-mail</label>
            <input value={form.companyEmail} onChange={set('companyEmail')} placeholder="contato@empresa.com.br" className={inputCls} />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Endereço</label>
            <input value={form.companyAddress} onChange={set('companyAddress')} placeholder="Rua X, 123 — Cidade/UF" className={inputCls} />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Rodapé do Orçamento</label>
            <textarea
              value={form.quoteFooter}
              onChange={set('quoteFooter')}
              rows={3}
              placeholder="Ex: Proposta válida por 15 dias. Não inclui instalação. CNPJ: 00.000.000/0001-00"
              className={inputCls + ' resize-none'}
            />
          </div>
        </div>

        <Button type="button" onClick={handleSave} disabled={saving} size="sm" className="flex items-center gap-2">
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
          ) : saved ? (
            <><CheckCircle2 className="w-4 h-4 text-green-400" /> Salvo!</>
          ) : (
            'Salvar configurações'
          )}
        </Button>
      </div>
    </div>
  );
};
