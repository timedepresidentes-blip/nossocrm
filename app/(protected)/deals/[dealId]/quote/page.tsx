'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { supabase } from '@/lib/supabase/client';
import { orgSettingsService, OrgQuoteSettings } from '@/lib/supabase/orgSettings';
import { ChevronDown, ChevronUp, Download, Loader2, Pencil, Save, X, Upload, Plus, Trash2, Check } from 'lucide-react';

interface ExtraItem { name: string; value: number }
interface QuoteExtras { installationCost?: number; extraItems?: ExtraItem[] }

interface QuoteItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  kitDescription?: string;
  imageUrl?: string;
  kitImages?: { label: string; url: string }[];
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

// Cálculo de parcela (Price/SAC simplificado)
function pmt(pv: number, monthlyRate: number, nMonths: number): number {
  if (monthlyRate === 0) return pv / nMonths;
  return (pv * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -nMonths));
}

interface FinancingOption {
  bank: string;
  tagline: string;
  color: string;
  rate: number; // % a.m.
  terms: number[];
}

const FINANCING_OPTIONS: FinancingOption[] = [
  {
    bank: 'Santander',
    tagline: 'Crédito Solar',
    color: '#EC0000',
    rate: 1.09,
    terms: [36, 60, 84],
  },
  {
    bank: 'BV',
    tagline: 'Financiamento Fotovoltaico',
    color: '#004B87',
    rate: 0.99,
    terms: [36, 60, 72],
  },
];

interface EditableItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  isNew?: boolean;
}

export default function QuotePage() {
  const { dealId } = useParams<{ dealId: string }>();
  const searchParams = useSearchParams();
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [orgSettings, setOrgSettings] = useState<OrgQuoteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isDownloading, setIsDownloading] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [overrides, setOverrides] = useState<Partial<OrgQuoteSettings>>({});
  const [savingOverride, setSavingOverride] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [extras, setExtras] = useState<QuoteExtras>({ installationCost: undefined, extraItems: [] });

  // Modo de edição
  const [isEditing, setIsEditing] = useState(() => searchParams?.get('edit') === '1');
  const [editItems, setEditItems] = useState<EditableItem[]>([]);
  const [editTitle, setEditTitle] = useState('');
  const [editFormaPagamento, setEditFormaPagamento] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editSaved, setEditSaved] = useState(false);

  useEffect(() => {
    async function load() {
      if (!supabase || !dealId) return;
      try {
        const [dealRes, settingsRes] = await Promise.all([
          supabase
            .from('deals')
            .select(`
              id, title, value, created_at, contact_id, quote_overrides, ficha_cliente,
              deal_items(id, name, quantity, price, product_id, products(kit_description, image_url, kit_images)),
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
          imageUrl: i.products?.image_url || undefined,
          kitImages: i.products?.kit_images || undefined,
        }));

        const effectiveItems = items.length > 0 ? items : [
          { id: 'total', name: d.title, quantity: 1, price: Number(d.value ?? 0) },
        ];

        const savedOverrides: Partial<OrgQuoteSettings> = d.quote_overrides ?? {};
        const savedExtras: QuoteExtras = (d.quote_overrides as any)?.__extras ?? {};

        setExtras({
          installationCost: savedExtras.installationCost,
          extraItems: savedExtras.extraItems ?? [],
        });

        const quoteData: QuoteData = {
          dealTitle: d.title,
          dealValue: Number(d.value ?? 0),
          contactName: contact?.name ?? '—',
          contactPhone: contact?.phone ?? '',
          contactEmail: contact?.email ?? '',
          companyName: crmCompany?.name ?? '',
          createdAt: d.created_at,
          items: effectiveItems,
          quoteOverrides: savedOverrides,
        };
        setQuote(quoteData);

        // Inicializa estado de edição
        setEditItems(effectiveItems.map(i => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          price: i.price,
        })));
        setEditTitle(d.title || '');
        setEditFormaPagamento(d.ficha_cliente?.formaPagamento || '');

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
    const clean: Record<string, unknown> = { __extras: extras };
    for (const [k, v] of Object.entries(overrides)) {
      if (v && String(v).trim()) clean[k] = String(v).trim();
    }
    await supabase.from('deals').update({ quote_overrides: clean }).eq('id', dealId);
    setQuote((prev) => prev ? { ...prev, quoteOverrides: clean as Partial<OrgQuoteSettings> } : prev);
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

  const saveEdit = async () => {
    if (!supabase || !dealId) return;
    setSavingEdit(true);
    try {
      const validItems = editItems.filter(i => i.name.trim());
      const newTotal = validItems.reduce((s, i) => s + i.quantity * i.price, 0);

      // Remove itens antigos que não são "total" fallback
      const existingIds = validItems.filter(i => !i.isNew && i.id !== 'total').map(i => i.id);
      const { data: currentItems } = await supabase
        .from('deal_items')
        .select('id')
        .eq('deal_id', dealId);
      const toDelete = (currentItems || []).map((r: any) => r.id).filter((id: string) => !existingIds.includes(id));
      if (toDelete.length > 0) {
        await supabase.from('deal_items').delete().in('id', toDelete);
      }

      // Upsert itens editados
      for (const item of validItems) {
        if (item.isNew || item.id === 'total') {
          await supabase.from('deal_items').insert({
            deal_id: dealId,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
          });
        } else {
          await supabase.from('deal_items').update({
            name: item.name,
            quantity: item.quantity,
            price: item.price,
          }).eq('id', item.id);
        }
      }

      // Atualiza deal: título, valor, forma de pagamento
      const fichaUpdate = editFormaPagamento
        ? { ficha_cliente: { formaPagamento: editFormaPagamento } }
        : {};
      await supabase.from('deals').update({
        title: editTitle || undefined,
        value: newTotal,
        ...fichaUpdate,
      }).eq('id', dealId);

      // Reflete no estado local
      const newItems = validItems.map(i => ({
        id: i.id === 'total' ? crypto.randomUUID() : i.id,
        name: i.name,
        quantity: i.quantity,
        price: i.price,
      }));
      setQuote(prev => prev ? {
        ...prev,
        dealTitle: editTitle || prev.dealTitle,
        dealValue: newTotal,
        items: newItems,
      } : prev);
      setEditItems(newItems);
      setEditSaved(true);
      setTimeout(() => { setEditSaved(false); setIsEditing(false); }, 1500);
    } finally {
      setSavingEdit(false);
    }
  };

  const addEditItem = () => {
    setEditItems(prev => [...prev, { id: crypto.randomUUID(), name: '', quantity: 1, price: 0, isNew: true }]);
  };

  const removeEditItem = (idx: number) => {
    setEditItems(prev => prev.filter((_, i) => i !== idx));
  };

  const updateEditItem = (idx: number, field: keyof EditableItem, value: string | number) => {
    setEditItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  // Faz upload de imagem para o bucket público 'assets' e retorna a URL pública
  async function uploadImageAsset(file: File, fieldKey: string): Promise<string | null> {
    if (!supabase) return null;
    setUploadingField(fieldKey);
    try {
      const ext = file.name.split('.').pop() ?? 'png';
      const path = `quote-assets/${dealId}/${fieldKey}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('assets').upload(path, file, {
        upsert: true,
        contentType: file.type,
      });
      if (error) { console.error('Upload error:', error); return null; }
      const { data } = supabase.storage.from('assets').getPublicUrl(path);
      return data.publicUrl ?? null;
    } finally {
      setUploadingField(null);
    }
  }

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

  const eff: OrgQuoteSettings = {
    logoUrl: quote.quoteOverrides.logoUrl ?? orgSettings?.logoUrl ?? '',
    companyPhone: quote.quoteOverrides.companyPhone ?? orgSettings?.companyPhone ?? '',
    companyEmail: quote.quoteOverrides.companyEmail ?? orgSettings?.companyEmail ?? '',
    companyAddress: quote.quoteOverrides.companyAddress ?? orgSettings?.companyAddress ?? '',
    quoteFooter: quote.quoteOverrides.quoteFooter ?? orgSettings?.quoteFooter ?? '',
    bannerImageUrl: quote.quoteOverrides.bannerImageUrl ?? orgSettings?.bannerImageUrl ?? '',
  };

  const handleDownloadPDF = async () => {
    const root = document.getElementById('quote-print-target');
    if (!root) return;
    setIsDownloading(true);
    setPdfError('');
    const toolbar = document.getElementById('quote-toolbar');
    if (toolbar) toolbar.style.visibility = 'hidden';
    try {
      // Coleta Y de cada seção (CSS px relativos ao topo do root) como pontos de quebra naturais
      const rootRect = root.getBoundingClientRect();
      const sectionBreaksCssPx: number[] = [
        'pdf-sec-header', 'pdf-sec-banner', 'pdf-sec-client',
        'pdf-sec-items', 'pdf-sec-financing', 'pdf-sec-footer',
      ]
        .map(id => document.getElementById(id))
        .filter((el): el is HTMLElement => !!el)
        .map(el => el.getBoundingClientRect().top - rootRect.top);

      // Captura todo o conteúdo em alta resolução
      const dataUrl = await toPng(root, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });

      const img = await new Promise<HTMLImageElement>((resolve) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.src = dataUrl;
      });

      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const pdfW = pdf.internal.pageSize.getWidth();  // 210mm
      const pdfH = pdf.internal.pageSize.getHeight(); // 297mm
      const imgW = img.naturalWidth;
      const imgH = img.naturalHeight;

      // pixelRatio=2: 1 CSS px = 2 imagem px → converter posição DOM para mm na imagem
      const mmPerPx = pdfW / imgW;
      const totalMm = imgH * mmPerPx;
      const breaksMm = sectionBreaksCssPx.map(cssPx => cssPx * 2 * mmPerPx);

      // Gera páginas com quebra inteligente: prefere quebrar no início de uma seção
      let posMm = 0;
      let pageIdx = 0;
      while (posMm < totalMm - 0.5) {
        if (pageIdx > 0) pdf.addPage();

        const idealEndMm = posMm + pdfH;
        // Procura a última quebra de seção que cai nos 35% finais desta página
        const threshold = posMm + pdfH * 0.65;
        const naturalBreak = breaksMm
          .filter(b => b > threshold && b <= idealEndMm)
          .sort((a, b) => b - a)[0];

        const pageEndMm = Math.min(naturalBreak ?? idealEndMm, totalMm);
        const sliceHMm = pageEndMm - posMm;

        // Extrai o slice via canvas sem re-renderizar o DOM
        const srcYPx = Math.round(posMm / mmPerPx);
        const srcHPx = Math.round(sliceHMm / mmPerPx);
        const canvas = document.createElement('canvas');
        canvas.width = imgW;
        canvas.height = srcHPx;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, imgW, srcHPx);
        ctx.drawImage(img, 0, srcYPx, imgW, srcHPx, 0, 0, imgW, srcHPx);

        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pdfW, sliceHMm);
        posMm = pageEndMm;
        pageIdx++;
      }

      pdf.save(`orcamento-${dealId.slice(0, 8).toUpperCase()}.pdf`);
    } catch (e: any) {
      setPdfError(e?.message || 'Erro ao gerar PDF');
    } finally {
      if (toolbar) toolbar.style.visibility = '';
      setIsDownloading(false);
    }
  };

  const hasOverride = Object.values(quote.quoteOverrides).some((v) => v && String(v).trim());
  const instCost = extras.installationCost ?? 0;
  const extrasCost = (extras.extraItems ?? []).reduce((s, e) => s + (e.value || 0), 0);
  const subtotal = quote.items.reduce((sum, i) => sum + i.quantity * i.price, 0) + instCost + extrasCost;

  const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40';

  // Campos de imagem com upload direto (logo e banner)
  const imageFields: { key: 'logoUrl' | 'bannerImageUrl'; label: string; hint: string }[] = [
    { key: 'logoUrl', label: 'Logo da empresa', hint: 'PNG/JPEG até 5 MB' },
    { key: 'bannerImageUrl', label: 'Imagem de fundo / destaque', hint: 'Foto da usina, instalação — PNG/JPEG' },
  ];

  const customizableFields: { key: keyof OrgQuoteSettings; label: string; isTextarea?: boolean }[] = [
    { key: 'companyPhone', label: 'Telefone' },
    { key: 'companyEmail', label: 'E-mail' },
    { key: 'companyAddress', label: 'Endereço' },
    { key: 'quoteFooter', label: 'Rodapé', isTextarea: true },
  ];

  return (
    <>
      {/* Toolbar — oculta na impressão */}
      <div id="quote-toolbar" className="print:hidden fixed top-4 right-4 z-50 flex flex-col items-end gap-2">
        <div className="flex gap-2 flex-wrap justify-end">
          {/* Botões de edição */}
          {isEditing ? (
            <>
              <button
                onClick={saveEdit}
                disabled={savingEdit}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-500 shadow-lg disabled:opacity-60"
              >
                {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : editSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {editSaved ? 'Salvo!' : savingEdit ? 'Salvando...' : 'Salvar edições'}
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-lg"
              >
                Cancelar
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleDownloadPDF}
                disabled={isDownloading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-500 shadow-lg disabled:opacity-60"
              >
                {isDownloading ? <><Loader2 className="w-4 h-4 animate-spin" />Gerando…</> : <><Download className="w-4 h-4" />Baixar PDF</>}
              </button>
              {pdfError && <p className="text-xs text-red-500 bg-white rounded-lg px-3 py-1.5 shadow">{pdfError}</p>}
              <button
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-lg"
              >
                <Pencil className="w-4 h-4" />
                Editar orçamento
              </button>
              <button
                onClick={() => window.history.length > 1 ? window.history.back() : window.close()}
                className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-lg"
              >
                Fechar
              </button>
            </>
          )}
        </div>

        {!isEditing && (
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
        )}

        {isCustomizing && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl p-4 w-80 space-y-3 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700">Personalizar este orçamento</p>
              <button onClick={() => setIsCustomizing(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-slate-400">Sobrescreve apenas este orçamento. Os demais usam o padrão salvo em Configurações.</p>

            {/* Campos de imagem com upload */}
            {imageFields.map(({ key, label, hint }) => {
              const currentUrl = overrides[key] ?? orgSettings?.[key] ?? '';
              const isUploading = uploadingField === key;
              return (
                <div key={key} className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-slate-500">{label}</label>
                  <p className="text-[10px] text-slate-400">{hint}</p>

                  {/* Preview da imagem atual */}
                  {currentUrl && (
                    <div className="relative rounded-lg overflow-hidden border border-slate-200" style={{ height: key === 'logoUrl' ? '60px' : '80px' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={currentUrl} alt={label} className="w-full h-full object-contain bg-slate-50" />
                      <button
                        type="button"
                        onClick={() => setOverrides(p => ({ ...p, [key]: '' }))}
                        className="absolute top-1 right-1 bg-white/80 rounded-full p-0.5 text-slate-500 hover:text-red-500"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {/* Upload */}
                  <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 cursor-pointer hover:border-blue-400 transition-colors bg-slate-50">
                    {isUploading ? (
                      <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin flex-shrink-0" />
                    ) : (
                      <Upload className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    )}
                    <span className="text-xs text-slate-500">
                      {isUploading ? 'Enviando…' : currentUrl ? 'Substituir imagem' : 'Carregar imagem'}
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      disabled={isUploading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const url = await uploadImageAsset(file, key);
                        if (url) setOverrides(p => ({ ...p, [key]: url }));
                      }}
                    />
                  </label>

                  {/* URL manual como alternativa */}
                  <input
                    value={overrides[key] ?? ''}
                    onChange={(e) => setOverrides((p) => ({ ...p, [key]: e.target.value }))}
                    placeholder="Ou cole uma URL de imagem"
                    className={inputCls + ' text-xs'}
                  />
                </div>
              );
            })}

            {/* Campos de texto */}
            {customizableFields.map(({ key, label, isTextarea }) => (
              <div key={key}>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">{label}</label>
                {isTextarea ? (
                  <textarea
                    rows={2}
                    value={overrides[key] ?? ''}
                    onChange={(e) => setOverrides((p) => ({ ...p, [key]: e.target.value }))}
                    placeholder={orgSettings?.[key] || 'Padrão global'}
                    className={inputCls + ' resize-none text-xs'}
                  />
                ) : (
                  <input
                    value={overrides[key] ?? ''}
                    onChange={(e) => setOverrides((p) => ({ ...p, [key]: e.target.value }))}
                    placeholder={orgSettings?.[key] || 'Padrão global'}
                    className={inputCls + ' text-xs'}
                  />
                )}
              </div>
            ))}

            {/* Custo de instalação */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Custo de Instalação (R$)</label>
              <input
                type="number" min="0" step="0.01" placeholder="0,00"
                value={extras.installationCost ?? ''}
                onChange={(e) => setExtras(p => ({ ...p, installationCost: e.target.value ? Number(e.target.value) : undefined }))}
                className={inputCls + ' text-xs'}
              />
            </div>

            {/* Custos extras nomeados */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-slate-500">Custos adicionais</p>
              {(extras.extraItems ?? []).map((item, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <input type="text" placeholder="Nome (ex: Homologação)"
                    value={item.name}
                    onChange={e => setExtras(p => ({ ...p, extraItems: (p.extraItems ?? []).map((x, idx) => idx === i ? { ...x, name: e.target.value } : x) }))}
                    className={inputCls + ' text-xs flex-1'} />
                  <input type="number" min="0" step="0.01" placeholder="R$"
                    value={item.value || ''}
                    onChange={e => setExtras(p => ({ ...p, extraItems: (p.extraItems ?? []).map((x, idx) => idx === i ? { ...x, value: Number(e.target.value) } : x) }))}
                    className={inputCls + ' text-xs w-24'} />
                  <button onClick={() => setExtras(p => ({ ...p, extraItems: (p.extraItems ?? []).filter((_, idx) => idx !== i) }))}
                    className="text-slate-300 hover:text-red-400 p-1 flex-shrink-0">✕</button>
                </div>
              ))}
              <button onClick={() => setExtras(p => ({ ...p, extraItems: [...(p.extraItems ?? []), { name: '', value: 0 }] }))}
                className="text-xs text-blue-500 hover:text-blue-700 font-medium">+ Adicionar custo</button>
            </div>

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

      {/* Banner de modo de edição */}
      {isEditing && (
        <div className="print:hidden fixed top-0 left-0 right-0 z-40 bg-amber-500 text-white text-center py-2 text-sm font-semibold">
          ✏️ Modo de edição — clique nos campos do orçamento para editar
        </div>
      )}

      {/* Documento imprimível */}
      <div id="quote-print-target" className={`min-h-screen bg-white print:bg-white p-8 max-w-[860px] mx-auto font-sans text-slate-800 ${isEditing ? 'mt-10' : ''}`}>

        {/* Cabeçalho */}
        <div id="pdf-sec-header" className="flex items-center justify-between mb-8 pb-6 border-b-2 border-slate-200">
          <div>
            {eff.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={eff.logoUrl} alt="Logo" className="max-h-44 max-w-[400px] object-contain" />
            ) : (
              <div className="text-3xl font-bold text-slate-700">ORÇAMENTO</div>
            )}
            {eff.companyAddress && (
              <p className="text-xs text-slate-500 mt-2">{eff.companyAddress}</p>
            )}
            {(eff.companyPhone || eff.companyEmail) && (
              <p className="text-xs text-slate-500">
                {[eff.companyPhone, eff.companyEmail].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Orçamento</div>
            {isEditing ? (
              <input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                className="mt-1 text-sm font-medium text-slate-700 border border-amber-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-400/40 w-64 text-right"
                placeholder="Título do orçamento"
              />
            ) : (
              <div className="text-lg font-bold text-slate-700 mt-0.5">#{dealId.slice(0, 8).toUpperCase()}</div>
            )}
            <div className="text-xs text-slate-500 mt-1">{formatDate(quote.createdAt)}</div>
          </div>
        </div>

        {/* Banner da usina/instalação */}
        {eff.bannerImageUrl && (
          <div id="pdf-sec-banner" className="mb-8 rounded-2xl overflow-hidden" style={{ height: '220px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={eff.bannerImageUrl}
              alt="Instalação solar"
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Cliente */}
        <div id="pdf-sec-client" className="mb-8 grid grid-cols-2 gap-6">
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-400 mb-1">Cliente</div>
            <div className="font-semibold text-slate-800">{quote.contactName}</div>
            {quote.companyName && <div className="text-sm text-slate-600">{quote.companyName}</div>}
            {quote.contactPhone && <div className="text-sm text-slate-500">{quote.contactPhone}</div>}
            {quote.contactEmail && <div className="text-sm text-slate-500">{quote.contactEmail}</div>}
          </div>
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-400 mb-1">Proposta</div>
            <div className="font-semibold text-slate-800">Proposta Comercial</div>
            <div className="text-sm text-slate-500 mt-1">Data: {formatDate(quote.createdAt)}</div>
          </div>
        </div>

        {/* Tabela de itens */}
        {isEditing ? (
          /* Modo edição: inputs inline */
          <div id="pdf-sec-items" className="mb-8 border border-amber-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-amber-50 text-amber-800 border-b border-amber-200">
                  <th className="text-left px-4 py-3 font-semibold">Descrição</th>
                  <th className="text-center px-3 py-3 font-semibold w-20">Qtd</th>
                  <th className="text-right px-3 py-3 font-semibold w-36">Preço Unit.</th>
                  <th className="text-right px-3 py-3 font-semibold w-32">Total</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {editItems.map((item, i) => (
                  <tr key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                    <td className="px-3 py-2">
                      <input
                        value={item.name}
                        onChange={e => updateEditItem(i, 'name', e.target.value)}
                        className="w-full border border-amber-300 rounded-lg px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                        placeholder="Descrição do item"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number" min="1"
                        value={item.quantity}
                        onChange={e => updateEditItem(i, 'quantity', Number(e.target.value) || 1)}
                        className="w-full border border-amber-300 rounded-lg px-2 py-1.5 text-sm text-center text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number" min="0" step="0.01"
                        value={item.price}
                        onChange={e => updateEditItem(i, 'price', Number(e.target.value) || 0)}
                        className="w-full border border-amber-300 rounded-lg px-2 py-1.5 text-sm text-right text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-semibold text-slate-700">
                      {formatBRL(item.quantity * item.price)}
                    </td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() => removeEditItem(i)}
                        className="p-1 text-slate-300 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} className="px-3 py-2">
                    <button
                      onClick={addEditItem}
                      className="inline-flex items-center gap-1.5 text-xs text-amber-700 hover:text-amber-900 font-medium"
                    >
                      <Plus className="w-3.5 h-3.5" /> Adicionar item
                    </button>
                  </td>
                </tr>
                <tr className="border-t border-amber-200 bg-amber-50">
                  <td colSpan={2} />
                  <td className="px-3 py-3 text-right font-bold text-amber-800">TOTAL</td>
                  <td className="px-3 py-3 text-right font-bold text-amber-900">
                    {formatBRL(editItems.reduce((s, i) => s + i.quantity * i.price, 0))}
                  </td>
                  <td />
                </tr>
                <tr className="bg-amber-50/50">
                  <td colSpan={5} className="px-3 py-2">
                    <label className="text-xs font-semibold text-amber-700 block mb-1">Forma de pagamento</label>
                    <input
                      value={editFormaPagamento}
                      onChange={e => setEditFormaPagamento(e.target.value)}
                      className="w-full border border-amber-300 rounded-lg px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                      placeholder="Ex: À vista no PIX, Financiamento Santander 60x..."
                    />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
        <table id="pdf-sec-items" className="w-full mb-8 text-sm">
          <thead>
            <tr className="bg-slate-800 text-white">
              <th className="text-left px-4 py-3 rounded-tl-lg font-semibold">Descrição</th>
              <th className="text-center px-4 py-3 font-semibold w-16">Qtd</th>
              <th className="text-right px-4 py-3 font-semibold w-32">Preço Unit.</th>
              <th className="text-right px-4 py-3 rounded-tr-lg font-semibold w-32">Total</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item, i) => (
              <tr key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                <td className="px-4 py-4">
                  <div className="text-slate-800 font-semibold text-base">{item.name}</div>
                  {item.kitDescription && (
                    <div className="mt-1 text-xs text-slate-500 whitespace-pre-line leading-relaxed">
                      {item.kitDescription}
                    </div>
                  )}
                  {item.kitImages && item.kitImages.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-4">
                      {item.kitImages.map((img, idx) => (
                        <div key={idx} className="flex flex-col items-center gap-1.5" style={{ width: '120px' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.url}
                            alt={img.label}
                            style={{ width: '120px', height: '120px', objectFit: 'contain' }}
                            className="rounded-xl border border-slate-200 bg-white p-2"
                          />
                          <span className="text-[11px] text-slate-600 font-medium text-center leading-tight">{img.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(!item.kitImages || item.kitImages.length === 0) && item.imageUrl && (
                    <div className="mt-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.imageUrl} alt={item.name} className="w-24 h-24 object-contain rounded-xl border border-slate-200 bg-white p-1" />
                    </div>
                  )}
                </td>
                <td className="px-4 py-4 text-center text-slate-600 align-top">{item.quantity}</td>
                <td className="px-4 py-4 text-right text-slate-600 align-top">{formatBRL(item.price)}</td>
                <td className="px-4 py-4 text-right font-semibold text-slate-800 align-top">{formatBRL(item.quantity * item.price)}</td>
              </tr>
            ))}
          </tbody>
          <tbody>
            {instCost > 0 && (
              <tr className="bg-slate-50/40">
                <td className="px-4 py-3 text-slate-700 font-medium">Instalação</td>
                <td className="px-4 py-3 text-center text-slate-500">1</td>
                <td className="px-4 py-3 text-right text-slate-600">{formatBRL(instCost)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatBRL(instCost)}</td>
              </tr>
            )}
            {(extras.extraItems ?? []).filter(e => e.name && e.value > 0).map((e, i) => (
              <tr key={`extra-${i}`} className="bg-slate-50/40">
                <td className="px-4 py-3 text-slate-700 font-medium">{e.name}</td>
                <td className="px-4 py-3 text-center text-slate-500">1</td>
                <td className="px-4 py-3 text-right text-slate-600">{formatBRL(e.value)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatBRL(e.value)}</td>
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
        )}

        {/* Opções de financiamento */}
        <div id="pdf-sec-financing" className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1 bg-slate-200" />
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Opções de Pagamento</h2>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            {/* Santander e BV */}
            {FINANCING_OPTIONS.map((opt) => (
              <div key={opt.bank} className="rounded-2xl border border-slate-200 overflow-hidden">
                {/* Header colorido do banco */}
                <div className="px-4 py-3 text-white font-bold text-sm" style={{ backgroundColor: opt.color }}>
                  {opt.bank}
                  <div className="text-[11px] font-normal opacity-90">{opt.tagline}</div>
                </div>
                <div className="p-3 space-y-2 bg-slate-50/60">
                  <div className="text-[11px] text-slate-500 font-medium">
                    Taxa a partir de <span className="font-bold text-slate-700">{opt.rate.toFixed(2).replace('.', ',')}% a.m.</span>
                  </div>
                  {opt.terms.map((n) => {
                    const monthly = pmt(subtotal, opt.rate / 100, n);
                    return (
                      <div key={n} className="flex items-center justify-between py-1.5 border-t border-slate-200 first:border-0">
                        <span className="text-xs text-slate-600 font-semibold">{n}x</span>
                        <span className="text-sm font-bold text-slate-800">{formatBRL(monthly)}<span className="text-[10px] text-slate-400 font-normal">/mês</span></span>
                      </div>
                    );
                  })}
                  <p className="text-[10px] text-slate-400 pt-1">Sujeito à análise de crédito</p>
                </div>
              </div>
            ))}

            {/* Cartão de crédito */}
            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 text-white font-bold text-sm" style={{ backgroundColor: '#1a1a2e' }}>
                Cartão de Crédito
                <div className="text-[11px] font-normal opacity-90">Parcelado sem juros</div>
              </div>
              <div className="p-3 space-y-2 bg-slate-50/60">
                <div className="text-[11px] text-slate-500 font-medium">
                  Parcelamento em até <span className="font-bold text-slate-700">12x sem juros</span>
                </div>
                {[3, 6, 12].map((n) => (
                  <div key={n} className="flex items-center justify-between py-1.5 border-t border-slate-200 first:border-0">
                    <span className="text-xs text-slate-600 font-semibold">{n}x</span>
                    <span className="text-sm font-bold text-slate-800">{formatBRL(subtotal / n)}<span className="text-[10px] text-slate-400 font-normal">/mês</span></span>
                  </div>
                ))}
                <p className="text-[10px] text-slate-400 pt-1">Principais bandeiras aceitas</p>
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé personalizado */}
        {eff.quoteFooter && (
          <div id="pdf-sec-footer" className="mt-8 pt-6 border-t border-slate-200">
            <p className="text-xs text-slate-400 whitespace-pre-wrap">{eff.quoteFooter}</p>
          </div>
        )}
      </div>

      <style>{`
        @media print {
          @page { margin: 1.5cm; size: A4; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body * { visibility: hidden !important; }
          #quote-print-target, #quote-print-target * { visibility: visible !important; }
          #quote-print-target { position: fixed; inset: 0; width: 100%; background: white; overflow: visible; }
        }
      `}</style>
    </>
  );
}
