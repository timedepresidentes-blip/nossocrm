'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { orgSettingsService, OrgQuoteSettings } from '@/lib/supabase/orgSettings';
import { ChevronDown, ChevronUp, Loader2, Pencil, Printer, Save, X } from 'lucide-react';

interface QuoteItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  kitDescription?: string;
}

interface QuoteData {
  dealTitle: string;
  dealValue: number;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  companyName: string;
  createdAt: string;
  items: QuoteItem[];
  quoteOverrides: Partial<OrgQuoteSettings>;
}

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function QuotePage() {
  const { dealId } = useParams<{ dealId: string }>();
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [orgSettings, setOrgSettings] = useState<OrgQuoteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Painel de personalização
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [overrides, setOverrides] = useState<Partial<OrgQuoteSettings>>({});
  const [savingOverride, setSavingOverride] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  useEffect(() => {
    async function load() {
      if (!supabase || !dealId) return;
      try {
        const [dealRes, settingsRes] = await Promise.all([
          supabase
            .from('deals')
            .select(`
              id, title, value, created_at, contact_id, quote_overrides,
              deal_items(id, name, quantity, price, product_id, products(kit_description)),
              contacts(name, phone, email, client_company_id),
              crm_companies(name)
            `)
            .eq('id', dealId)
            .maybeSingle(),
          orgSettingsService.getQuoteSettings(),
        ]);

        if (dealRes.error) throw dealRes.error;
        if (!dealRes.data) throw new Error('Deal não encontrado');

        const d = dealRes.data as any;
        const contact = Array.isArray(d.contacts) ? d.contacts[0] : d.contacts;
        const crmCompany = Array.isArray(d.crm_companies) ? d.crm_companies[0] : d.crm_companies;

        const items: QuoteItem[] = (d.deal_items || []).map((i: any) => ({
          id: i.id,
          name: i.name,
          quantity: Number(i.quantity ?? 1),
          price: Number(i.price ?? 0),
          kitDescription: i.products?.kit_description || undefined,
        }));

        const effectiveItems = items.length > 0 ? items : [
          { id: 'total', name: d.title, quantity: 1, price: Number(d.value ?? 0) },
        ];

        const savedOverrides: Partial<OrgQuoteSettings> = d.quote_overrides ?? {};

        setQuote({
          dealTitle: d.title,
          dealValue: Number(d.value ?? 0),
          contactName: contact?.name ?? '—',
          contactPhone: contact?.phone ?? '',
          contactEmail: contact?.email ?? '',
          companyName: crmCompany?.name ?? '',
          createdAt: d.created_at,
          items: effectiveItems,
          quoteOverrides: savedOverrides,
        });

        if (settingsRes.data) setOrgSettings(settingsRes.data);
        setOverrides(savedOverrides);
      } catch (e: any) {
        setError(e.message || 'Erro ao carregar orçamento');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [dealId]);

  const saveOverride = async () => {
    if (!supabase || !dealId) return;
    setSavingOverride(true);
    // Remove campos vazios para não sobrescrever o padrão com string vazia
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(overrides)) {
      if (v && String(v).trim()) clean[k] = String(v).trim();
    }
    await supabase.from('deals').update({ quote_overrides: clean }).eq('id', dealId);
    setQuote((prev) => prev ? { ...prev, quoteOverrides: clean } : prev);
    setSavingOverride(false);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
    setIsCustomizing(false);
  };

  const clearOverride = async () => {
    if (!supabase || !dealId) return;
    await supabase.from('deals').update({ quote_overrides: {} }).eq('id', dealId);
    setOverrides({});
    setQuote((prev) => prev ? { ...prev, quoteOverrides: {} } : prev);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500">
        {error || 'Erro ao carregar orçamento'}
      </div>
    );
  }

  // Configurações efetivas = padrão global + overrides deste orçamento
  const eff: OrgQuoteSettings = {
    logoUrl: quote.quoteOverrides.logoUrl ?? orgSettings?.logoUrl ?? '',
    companyPhone: quote.quoteOverrides.companyPhone ?? orgSettings?.companyPhone ?? '',
    companyEmail: quote.quoteOverrides.companyEmail ?? orgSettings?.companyEmail ?? '',
    companyAddress: quote.quoteOverrides.companyAddress ?? orgSettings?.companyAddress ?? '',
    quoteFooter: quote.quoteOverrides.quoteFooter ?? orgSettings?.quoteFooter ?? '',
  };

  const hasOverride = Object.values(quote.quoteOverrides).some((v) => v && String(v).trim());
  const subtotal = quote.items.reduce((sum, i) => sum + i.quantity * i.price, 0);

  const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40';

  return (
    <>
      {/* Toolbar — oculta na impressão */}
      <div className="print:hidden fixed top-4 right-4 z-50 flex flex-col items-end gap-2">
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-500 shadow-lg"
          >
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </button>
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-lg"
          >
            Voltar
          </button>
        </div>

        {/* Botão personalizar */}
        <button
          onClick={() => setIsCustomizing((v) => !v)}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium shadow-lg border transition-colors ${
            hasOverride
              ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Pencil className="w-3.5 h-3.5" />
          {hasOverride ? 'Personalizado' : 'Personalizar este orçamento'}
          {isCustomizing ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {/* Painel de personalização */}
        {isCustomizing && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl p-4 w-80 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700">Personalizar este orçamento</p>
              <button onClick={() => setIsCustomizing(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-slate-400">Sobrescreve apenas este orçamento. Os demais usam o padrão salvo em Configurações.</p>

            {(['logoUrl', 'companyPhone', 'companyEmail', 'companyAddress', 'quoteFooter'] as (keyof OrgQuoteSettings)[]).map((key) => {
              const labels: Record<keyof OrgQuoteSettings, string> = {
                logoUrl: 'URL do Logo',
                companyPhone: 'Telefone',
                companyEmail: 'E-mail',
                companyAddress: 'Endereço',
                quoteFooter: 'Rodapé',
              };
              const placeholder = orgSettings?.[key] ?? '';
              const isTextarea = key === 'quoteFooter';
              return (
                <div key={key}>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">{labels[key]}</label>
                  {isTextarea ? (
                    <textarea
                      rows={2}
                      value={overrides[key] ?? ''}
                      onChange={(e) => setOverrides((p) => ({ ...p, [key]: e.target.value }))}
                      placeholder={placeholder || `Padrão global`}
                      className={inputCls + ' resize-none text-xs'}
                    />
                  ) : (
                    <input
                      value={overrides[key] ?? ''}
                      onChange={(e) => setOverrides((p) => ({ ...p, [key]: e.target.value }))}
                      placeholder={placeholder || `Padrão global`}
                      className={inputCls + ' text-xs'}
                    />
                  )}
                </div>
              );
            })}

            <div className="flex gap-2 pt-1">
              <button
                onClick={saveOverride}
                disabled={savingOverride}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-500 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {savingOverride ? 'Salvando...' : savedMsg ? 'Salvo!' : 'Salvar para este orçamento'}
              </button>
              {hasOverride && (
                <button
                  onClick={clearOverride}
                  className="px-3 py-2 border border-red-200 text-red-500 rounded-xl text-xs hover:bg-red-50"
                  title="Remover personalização e usar padrão"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Documento imprimível */}
      <div className="min-h-screen bg-white print:bg-white p-8 max-w-[860px] mx-auto font-sans text-slate-800">

        {/* Cabeçalho */}
        <div className="flex items-start justify-between mb-8 pb-6 border-b-2 border-slate-200">
          <div>
            {eff.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={eff.logoUrl} alt="Logo" className="max-h-16 max-w-[200px] object-contain mb-2" />
            ) : (
              <div className="text-2xl font-bold text-slate-700 mb-2">ORÇAMENTO</div>
            )}
            {eff.companyAddress && (
              <p className="text-xs text-slate-500">{eff.companyAddress}</p>
            )}
            {(eff.companyPhone || eff.companyEmail) && (
              <p className="text-xs text-slate-500">
                {[eff.companyPhone, eff.companyEmail].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Orçamento</div>
            <div className="text-lg font-bold text-slate-700 mt-0.5">#{dealId.slice(0, 8).toUpperCase()}</div>
            <div className="text-xs text-slate-500 mt-1">{formatDate(quote.createdAt)}</div>
          </div>
        </div>

        {/* Cliente */}
        <div className="mb-8 grid grid-cols-2 gap-6">
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-400 mb-1">Cliente</div>
            <div className="font-semibold text-slate-800">{quote.contactName}</div>
            {quote.companyName && <div className="text-sm text-slate-600">{quote.companyName}</div>}
            {quote.contactPhone && <div className="text-sm text-slate-500">{quote.contactPhone}</div>}
            {quote.contactEmail && <div className="text-sm text-slate-500">{quote.contactEmail}</div>}
          </div>
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-400 mb-1">Proposta</div>
            <div className="font-semibold text-slate-800">{quote.dealTitle}</div>
            <div className="text-sm text-slate-500 mt-1">Data: {formatDate(quote.createdAt)}</div>
          </div>
        </div>

        {/* Tabela de itens */}
        <table className="w-full mb-8 text-sm">
          <thead>
            <tr className="bg-slate-800 text-white">
              <th className="text-left px-4 py-3 rounded-tl-lg font-semibold">Descrição</th>
              <th className="text-center px-4 py-3 font-semibold w-20">Qtd</th>
              <th className="text-right px-4 py-3 font-semibold w-32">Preço Unit.</th>
              <th className="text-right px-4 py-3 rounded-tr-lg font-semibold w-32">Total</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item, i) => (
              <tr key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                <td className="px-4 py-3">
                  <div className="text-slate-800 font-medium">{item.name}</div>
                  {item.kitDescription && (
                    <div className="mt-1 text-xs text-slate-500 whitespace-pre-line leading-relaxed">
                      {item.kitDescription}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-center text-slate-600 align-top">{item.quantity}</td>
                <td className="px-4 py-3 text-right text-slate-600 align-top">{formatBRL(item.price)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-800 align-top">{formatBRL(item.quantity * item.price)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200">
              <td colSpan={2} />
              <td className="px-4 py-3 text-right text-sm font-semibold text-slate-500">Subtotal</td>
              <td className="px-4 py-3 text-right font-semibold text-slate-700">{formatBRL(subtotal)}</td>
            </tr>
            <tr className="bg-slate-800 text-white">
              <td colSpan={2} />
              <td className="px-4 py-3 text-right font-bold rounded-bl-lg">TOTAL</td>
              <td className="px-4 py-3 text-right font-bold text-lg rounded-br-lg">{formatBRL(subtotal)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Rodapé */}
        {eff.quoteFooter && (
          <div className="mt-8 pt-6 border-t border-slate-200">
            <p className="text-xs text-slate-400 whitespace-pre-wrap">{eff.quoteFooter}</p>
          </div>
        )}

        <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-300">
          <span>Gerado por NossoCRM</span>
          <span>{new Date().toLocaleString('pt-BR')}</span>
        </div>
      </div>

      <style>{`
        @media print {
          @page { margin: 1.5cm; size: A4; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </>
  );
}
