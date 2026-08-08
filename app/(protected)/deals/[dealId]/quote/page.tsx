'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { gerarPropostaHtmlCRM } from '@/lib/gerarPropostaHtmlCRM';
import { orgSettingsService, OrgQuoteSettings } from '@/lib/supabase/orgSettings';
import { ChevronDown, ChevronUp, Download, Loader2, Pencil, Save, X, Upload, Plus, Trash2, Check } from 'lucide-react';
// Loader2 mantido para o loading de dados

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

interface FichaCliente {
  nomeCompleto?: string;
  potenciaKwp?: number;
  numPaineis?: number;
  modeloPainel?: string;
  potenciaPainelW?: number;
  modeloInversor?: string;
  qtdInversores?: number;
  tipoEstrutura?: string;
  instalacaoTelhado?: string;
  instalacaoEndereco?: string;
  instalacaoCidade?: string;
  formaPagamento?: string;
  condicoesPagamento?: string;
  prazoEntrega?: string;
  observacoes?: string;
  valorTotal?: number;
  [key: string]: unknown;
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
  fichaCliente?: FichaCliente;
}

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

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
          contactName: contact?.name ?? (d.ficha_cliente?.nomeCompleto ?? '—'),
          contactPhone: contact?.phone ?? '',
          contactEmail: contact?.email ?? '',
          companyName: crmCompany?.name ?? '',
          createdAt: d.created_at,
          items: effectiveItems,
          quoteOverrides: savedOverrides,
          fichaCliente: d.ficha_cliente ?? undefined,
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

  const handleDownloadPDF = () => {
    if (!quote) return;
    const subtotalCalc = quote.items.reduce((sum, i) => sum + i.quantity * i.price, 0);
    const html = gerarPropostaHtmlCRM({
      clienteNome: quote.contactName,
      clienteCidade: quote.fichaCliente?.instalacaoCidade ?? null,
      dataEmissao: new Date(quote.createdAt).toLocaleDateString('pt-BR'),
      potenciaKwp: quote.fichaCliente?.potenciaKwp ?? null,
      numPaineis: quote.fichaCliente?.numPaineis ?? null,
      painelW: quote.fichaCliente?.potenciaPainelW ?? null,
      modeloPainel: quote.fichaCliente?.modeloPainel ?? null,
      modeloInversor: quote.fichaCliente?.modeloInversor ?? null,
      qtdInversores: quote.fichaCliente?.qtdInversores ?? null,
      tipoEstrutura: quote.fichaCliente?.tipoEstrutura ?? null,
      valorFinal: subtotalCalc,
      formaPagamento: quote.fichaCliente?.formaPagamento ?? null,
      condicoesPagamento: quote.fichaCliente?.condicoesPagamento ?? null,
      prazoEntrega: quote.fichaCliente?.prazoEntrega ?? null,
      observacoes: quote.fichaCliente?.observacoes ?? null,
      items: quote.items,
      logoUrl: eff.logoUrl || null,
      imagemFundoUrl: eff.bannerImageUrl || null,
      empresa: quote.companyName || 'Aureon Energix',
    });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
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
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-500 shadow-lg"
              >
                <Download className="w-4 h-4" />Gerar Proposta
              </button>
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
        <div id="pdf-sec-client" className="mb-6 grid grid-cols-2 gap-6">
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-400 mb-1">Cliente</div>
            <div className="font-semibold text-slate-800">{quote.fichaCliente?.nomeCompleto || quote.contactName}</div>
            {quote.companyName && <div className="text-sm text-slate-600">{quote.companyName}</div>}
            {(quote.fichaCliente?.instalacaoEndereco || quote.fichaCliente?.instalacaoCidade) && (
              <div className="text-xs text-slate-500 mt-1">
                {[quote.fichaCliente.instalacaoEndereco, quote.fichaCliente.instalacaoCidade].filter(Boolean).join(' — ')}
              </div>
            )}
            {quote.contactPhone && <div className="text-sm text-slate-500 mt-0.5">{quote.contactPhone}</div>}
            {quote.contactEmail && <div className="text-sm text-slate-500">{quote.contactEmail}</div>}
          </div>
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-400 mb-1">Proposta Comercial</div>
            <div className="font-semibold text-slate-800">{formatDate(quote.createdAt)}</div>
            {quote.fichaCliente?.prazoEntrega && (
              <div className="text-xs text-slate-500 mt-2 leading-relaxed">{quote.fichaCliente.prazoEntrega}</div>
            )}
            {quote.fichaCliente?.observacoes && (
              <div className="text-xs text-slate-400 mt-1 italic">{quote.fichaCliente.observacoes}</div>
            )}
          </div>
        </div>

        {/* Especificações do Sistema Solar */}
        {quote.fichaCliente?.potenciaKwp && (
          <div className="mb-6 rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-800 text-white px-4 py-2.5 flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider">Especificações do Sistema Solar</span>
              <span className="ml-auto text-sm font-bold text-yellow-400">{quote.fichaCliente.potenciaKwp} kWp</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y divide-slate-100 bg-white">
              {quote.fichaCliente.numPaineis && (
                <div className="px-4 py-3">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-0.5">Painéis</div>
                  <div className="text-sm font-semibold text-slate-800">{quote.fichaCliente.numPaineis} un.</div>
                  {quote.fichaCliente.modeloPainel && <div className="text-[11px] text-slate-500">{quote.fichaCliente.modeloPainel}</div>}
                </div>
              )}
              {quote.fichaCliente.modeloInversor && (
                <div className="px-4 py-3">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-0.5">Inversor</div>
                  <div className="text-sm font-semibold text-slate-800">{quote.fichaCliente.qtdInversores ?? 1} un.</div>
                  <div className="text-[11px] text-slate-500">{quote.fichaCliente.modeloInversor}</div>
                </div>
              )}
              {(quote.fichaCliente.tipoEstrutura || quote.fichaCliente.instalacaoTelhado) && (
                <div className="px-4 py-3">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-0.5">Estrutura</div>
                  <div className="text-sm font-semibold text-slate-800">{quote.fichaCliente.tipoEstrutura || quote.fichaCliente.instalacaoTelhado}</div>
                </div>
              )}
              <div className="px-4 py-3">
                <div className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-0.5">Potência</div>
                <div className="text-sm font-semibold text-slate-800">{quote.fichaCliente.potenciaKwp} kWp</div>
                {quote.fichaCliente.potenciaPainelW && <div className="text-[11px] text-slate-500">{quote.fichaCliente.potenciaPainelW}W / painel</div>}
              </div>
            </div>
          </div>
        )}

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

        {/* Condições de Pagamento — usa dados reais do contrato */}
        <div id="pdf-sec-financing" className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1 bg-slate-200" />
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Condições de Pagamento</h2>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          {(quote.fichaCliente?.formaPagamento || quote.fichaCliente?.condicoesPagamento) ? (
            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              <div className="bg-slate-800 text-white px-5 py-3 flex items-center justify-between">
                <span className="font-bold text-sm">{quote.fichaCliente.formaPagamento || 'Forma de pagamento'}</span>
                <span className="text-lg font-bold text-yellow-400">{formatBRL(subtotal)}</span>
              </div>
              {quote.fichaCliente.condicoesPagamento && (
                <div className="px-5 py-4 bg-slate-50">
                  <p className="text-slate-700 font-semibold text-base">{quote.fichaCliente.condicoesPagamento}</p>
                  <p className="text-xs text-slate-400 mt-1">Conforme acordado em contrato</p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 px-5 py-4 text-center text-slate-400 text-sm">
              Forma de pagamento não registrada no contrato.
            </div>
          )}
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
