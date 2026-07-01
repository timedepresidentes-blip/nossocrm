'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { orgSettingsService, OrgQuoteSettings } from '@/lib/supabase/orgSettings';
import { Loader2, Printer } from 'lucide-react';

interface QuoteItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  description?: string;
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

  useEffect(() => {
    async function load() {
      if (!supabase || !dealId) return;
      try {
        const [dealRes, settingsRes] = await Promise.all([
          supabase
            .from('deals')
            .select(`
              id, title, value, created_at, contact_id,
              deal_items(id, name, quantity, price, product_id),
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
        }));

        // Se não tem itens do deal, cria um item resumido com o valor total
        const effectiveItems = items.length > 0 ? items : [
          { id: 'total', name: d.title, quantity: 1, price: Number(d.value ?? 0) },
        ];

        setQuote({
          dealTitle: d.title,
          dealValue: Number(d.value ?? 0),
          contactName: contact?.name ?? '—',
          contactPhone: contact?.phone ?? '',
          contactEmail: contact?.email ?? '',
          companyName: crmCompany?.name ?? '',
          createdAt: d.created_at,
          items: effectiveItems,
        });

        if (settingsRes.data) setOrgSettings(settingsRes.data);
      } catch (e: any) {
        setError(e.message || 'Erro ao carregar orçamento');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [dealId]);

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

  const subtotal = quote.items.reduce((sum, i) => sum + i.quantity * i.price, 0);
  const total = subtotal;

  return (
    <>
      {/* Botão de impressão — oculto na impressão */}
      <div className="print:hidden fixed top-4 right-4 z-50 flex gap-2">
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-500 shadow-lg"
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

      {/* Documento imprimível */}
      <div className="min-h-screen bg-white print:bg-white p-8 max-w-[860px] mx-auto font-sans text-slate-800">

        {/* Cabeçalho */}
        <div className="flex items-start justify-between mb-8 pb-6 border-b-2 border-slate-200">
          <div>
            {orgSettings?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={orgSettings.logoUrl} alt="Logo" className="max-h-16 max-w-[200px] object-contain mb-2" />
            ) : (
              <div className="text-2xl font-bold text-slate-700 mb-2">ORÇAMENTO</div>
            )}
            {orgSettings?.companyAddress && (
              <p className="text-xs text-slate-500">{orgSettings.companyAddress}</p>
            )}
            {(orgSettings?.companyPhone || orgSettings?.companyEmail) && (
              <p className="text-xs text-slate-500">
                {[orgSettings.companyPhone, orgSettings.companyEmail].filter(Boolean).join(' · ')}
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
                <td className="px-4 py-3 text-slate-800 font-medium">{item.name}</td>
                <td className="px-4 py-3 text-center text-slate-600">{item.quantity}</td>
                <td className="px-4 py-3 text-right text-slate-600">{formatBRL(item.price)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatBRL(item.quantity * item.price)}</td>
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
              <td className="px-4 py-3 text-right font-bold text-lg rounded-br-lg">{formatBRL(total)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Rodapé */}
        {orgSettings?.quoteFooter && (
          <div className="mt-8 pt-6 border-t border-slate-200">
            <p className="text-xs text-slate-400 whitespace-pre-wrap">{orgSettings.quoteFooter}</p>
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
