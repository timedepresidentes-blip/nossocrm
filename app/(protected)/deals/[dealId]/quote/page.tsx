'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { gerarPropostaHtmlCRM } from '@/lib/gerarPropostaHtmlCRM';
import { orgSettingsService, OrgQuoteSettings } from '@/lib/supabase/orgSettings';
import { ChevronDown, ChevronUp, Download, Loader2, Pencil, Save, X, Upload, Plus, Trash2, Check, ExternalLink, Link2 } from 'lucide-react';

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

  const [orcafacilId, setOrcafacilId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

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
              id, title, value, created_at, contact_id, quote_overrides, ficha_cliente, orcafacil_id,
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

        if (d.orcafacil_id) setOrcafacilId(d.orcafacil_id);
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
      // Sincroniza com OrçaFácil após salvar
      syncToOrcafacil();
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

  const syncToOrcafacil = async (currentQuote = quote, currentOrcafacilId = orcafacilId) => {
    if (!currentQuote || !dealId) return null;
    setSyncing(true);
    try {
      const sub = currentQuote.items.reduce((s, i) => s + i.quantity * i.price, 0);
      const res = await fetch('/api/orcafacil/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dealId,
          clienteNome: currentQuote.fichaCliente?.nomeCompleto || currentQuote.contactName,
          clienteCidade: currentQuote.fichaCliente?.instalacaoCidade ?? null,
          clienteEnd: currentQuote.fichaCliente?.instalacaoEndereco ?? null,
          telefone: currentQuote.contactPhone || null,
          potenciaKwp: currentQuote.fichaCliente?.potenciaKwp ?? null,
          painelW: currentQuote.fichaCliente?.potenciaPainelW ?? null,
          numPaineis: currentQuote.fichaCliente?.numPaineis ?? null,
          modeloPainel: currentQuote.fichaCliente?.modeloPainel ?? null,
          modeloInversor: currentQuote.fichaCliente?.modeloInversor ?? null,
          qtdInversores: currentQuote.fichaCliente?.qtdInversores ?? null,
          tipoEstrutura: currentQuote.fichaCliente?.tipoEstrutura ?? null,
          valorFinal: sub,
          formaPagamento: currentQuote.fichaCliente?.formaPagamento ?? null,
        }),
      });
      const json = await res.json();
      if (json.orcafacilId && !currentOrcafacilId) {
        setOrcafacilId(json.orcafacilId);
        await supabase?.from('deals').update({ orcafacil_id: json.orcafacilId }).eq('id', dealId);
      }
      return json.orcafacilId;
    } catch (e) {
      console.error('Sync OrçaFácil failed', e);
      return null;
    } finally {
      setSyncing(false);
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
              {/* Botão OrçaFácil */}
              {orcafacilId ? (
                <button
                  onClick={() => window.open(`https://app-eight-eta-92.vercel.app/orcamento/${orcafacilId}`, '_blank')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-400 shadow-lg"
                  title="Abrir no OrçaFácil para gerar PDF com o template completo"
                >
                  <ExternalLink className="w-4 h-4" />OrçaFácil
                </button>
              ) : (
                <button
                  onClick={() => syncToOrcafacil()}
                  disabled={syncing}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-orange-100 border border-orange-300 text-orange-700 rounded-xl text-sm font-semibold hover:bg-orange-200 shadow-lg disabled:opacity-60"
                  title="Cria este orçamento no OrçaFácil e vincula"
                >
                  {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                  {syncing ? 'Vinculando…' : 'Vincular OrçaFácil'}
                </button>
              )}
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

      {/* Documento — design OrçaFácil */}
      <div id="quote-print-target" className={`mx-auto max-w-[860px] shadow-2xl ${isEditing ? 'mt-10' : 'mt-4 mb-8'}`} style={{ background: '#FAFAF8', color: '#171717', fontFamily: "'Archivo', sans-serif" }}>

        {/* Fonts */}
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Archivo+Narrow:wght@500;600;700&family=JetBrains+Mono:wght@500;600&display=swap');
          #quote-print-target { font-family: 'Archivo', sans-serif; }
          .of-secao-titulo { font-family: 'Archivo Narrow', sans-serif; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #B15A1E; margin-bottom: 18px; }
          .of-mono { font-family: 'JetBrains Mono', monospace; }
          .of-narrow { font-family: 'Archivo Narrow', sans-serif; }
          @media print {
            @page { margin: 0; size: A4 portrait; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            body * { visibility: hidden !important; }
            #quote-print-target, #quote-print-target * { visibility: visible !important; }
            #quote-print-target { position: fixed; inset: 0; width: 100%; max-width: 100%; box-shadow: none; margin: 0; }
          }
        `}</style>

        {/* HERO */}
        <div style={{ position: 'relative', height: '280px', overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={eff.bannerImageUrl || 'https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?fm=jpg&q=80&w=1600&auto=format&fit=crop'}
            alt="Instalação solar"
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 40%', display: 'block' }}
            crossOrigin="anonymous"
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(0,0,0,0.28) 0%,rgba(0,0,0,0.05) 50%,rgba(250,250,248,0.15) 80%,rgba(250,250,248,0.97) 100%)' }} />
          {eff.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={eff.logoUrl} alt="Logo" crossOrigin="anonymous" style={{ position: 'absolute', top: 20, left: 30, height: 70, objectFit: 'contain', maxWidth: 280 }} />
          ) : (
            <span className="of-mono" style={{ position: 'absolute', top: 20, left: 30, fontSize: 11, letterSpacing: 2, color: 'rgba(255,255,255,0.9)', textTransform: 'uppercase' }}>PROPOSTA SOLAR</span>
          )}
          <div className="of-mono" style={{ position: 'absolute', top: 20, right: 30, textAlign: 'right', fontSize: 10, color: 'rgba(255,255,255,0.85)', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
            Nº <strong style={{ color: '#fff' }}>#{dealId.slice(0, 8).toUpperCase()}</strong><br />
            Emissão: {formatDate(quote.createdAt)}<br />
            Validade: 3 dias
          </div>
        </div>

        {/* CABEÇALHO CLIENTE */}
        <div style={{ padding: '20px 40px 0 40px' }}>
          <div className="of-mono" style={{ fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: '#EA6A1E', marginBottom: 6 }}>Proposta Comercial · Energia Solar Fotovoltaica</div>
          <h1 className="of-narrow" style={{ fontWeight: 700, fontSize: 26, color: '#171717' }}>Sistema de Energia Solar Fotovoltaica</h1>
        </div>
        <div style={{ display: 'flex', gap: 36, padding: '12px 40px 22px 40px', flexWrap: 'wrap' }}>
          {[
            { k: 'Cliente', v: quote.fichaCliente?.nomeCompleto || quote.contactName },
            quote.fichaCliente?.instalacaoCidade ? { k: 'Local', v: quote.fichaCliente.instalacaoCidade } : null,
            { k: 'Data', v: formatDate(quote.createdAt) },
            quote.companyName ? { k: 'Empresa', v: quote.companyName } : null,
          ].filter(Boolean).map((item) => item && (
            <div key={item.k}>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: '#9A9A96', marginBottom: 3 }}>{item.k}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#171717' }}>{item.v}</div>
            </div>
          ))}
        </div>

        {/* RESUMO DO SISTEMA */}
        {quote.fichaCliente?.potenciaKwp && (
          <div style={{ padding: '24px 40px', borderTop: '1px solid #E5E2DC' }}>
            <div className="of-secao-titulo">Resumo do Sistema</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: '#E5E2DC', border: '1px solid #E5E2DC' }}>
              {[
                { k: 'Potência instalada', v: `${quote.fichaCliente.potenciaKwp} kWp`, sub: `${quote.fichaCliente.numPaineis ?? '—'} painéis de ${quote.fichaCliente.potenciaPainelW ?? '—'}W`, destaque: true },
                { k: 'Inversor', v: quote.fichaCliente.modeloInversor ?? '—', sub: `${quote.fichaCliente.qtdInversores ?? 1}x unidade`, destaque: false },
                { k: 'Investimento total', v: formatBRL(subtotal), sub: quote.fichaCliente.formaPagamento ?? '', destaque: false },
              ].map((c) => (
                <div key={c.k} style={{ background: c.destaque ? '#FFF7F0' : '#FFFFFF', borderLeft: c.destaque ? '4px solid #EA6A1E' : undefined, padding: '16px 14px' }}>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, color: c.destaque ? '#B15A1E' : '#6B6B68', marginBottom: 6, fontWeight: 500 }}>{c.k}</div>
                  <div className="of-narrow" style={{ fontSize: c.destaque ? 28 : 22, fontWeight: 700, color: c.destaque ? '#B15A1E' : '#171717', lineHeight: 1.15 }}>{c.v}</div>
                  {c.sub && <div style={{ fontSize: 11, color: '#9A9A96', marginTop: 3 }}>{c.sub}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* EQUIPAMENTOS */}
        {quote.fichaCliente?.potenciaKwp && (
          <div style={{ padding: '24px 40px', borderTop: '1px solid #E5E2DC' }}>
            <div className="of-secao-titulo">Equipamentos</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, color: '#6B6B68', paddingBottom: 10, borderBottom: '1.5px solid #171717' }}>Componente</th>
                  <th style={{ textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, color: '#6B6B68', paddingBottom: 10, borderBottom: '1.5px solid #171717' }}>Especificação</th>
                </tr>
              </thead>
              <tbody>
                {[
                  quote.fichaCliente.modeloPainel ? { nome: 'Módulos fotovoltaicos', spec: `${quote.fichaCliente.potenciaPainelW}W · ${quote.fichaCliente.numPaineis} un. · ${quote.fichaCliente.modeloPainel}` } : null,
                  quote.fichaCliente.modeloInversor ? { nome: 'Inversor', spec: `${quote.fichaCliente.modeloInversor} · ${quote.fichaCliente.qtdInversores ?? 1}x` } : null,
                  quote.fichaCliente.tipoEstrutura ? { nome: 'Estrutura de fixação', spec: quote.fichaCliente.tipoEstrutura } : null,
                  { nome: 'Cabeamento', spec: 'Solar 6mm² · Conectores MC4' },
                ].filter(Boolean).map((row) => row && (
                  <tr key={row.nome}>
                    <td style={{ padding: '11px 14px 11px 0', borderBottom: '1px solid #E5E2DC', fontSize: 14, fontWeight: 600, color: '#171717', width: 230 }}>{row.nome}</td>
                    <td style={{ padding: '11px 0', borderBottom: '1px solid #E5E2DC', fontSize: 13, color: '#4A4A48' }}>{row.spec}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ITENS DO ORÇAMENTO */}
        <div id="pdf-sec-items" style={{ padding: '24px 40px', borderTop: '1px solid #E5E2DC' }}>
          <div className="of-secao-titulo">Itens do Orçamento</div>
          {isEditing ? (
            <div style={{ border: '1px solid #fcd34d', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: '#fffbeb', color: '#92400e', borderBottom: '1px solid #fcd34d' }}>
                    <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600 }}>Descrição</th>
                    <th style={{ textAlign: 'center', padding: '10px 10px', fontWeight: 600, width: 70 }}>Qtd</th>
                    <th style={{ textAlign: 'right', padding: '10px 10px', fontWeight: 600, width: 130 }}>Preço Unit.</th>
                    <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 600, width: 120 }}>Total</th>
                    <th style={{ width: 32 }} />
                  </tr>
                </thead>
                <tbody>
                  {editItems.map((item, i) => (
                    <tr key={item.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafaf8' }}>
                      <td style={{ padding: '8px 10px' }}>
                        <input value={item.name} onChange={e => updateEditItem(i, 'name', e.target.value)}
                          className="w-full border border-amber-300 rounded-lg px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400/40" placeholder="Descrição" />
                      </td>
                      <td style={{ padding: '8px 6px' }}>
                        <input type="number" min="1" value={item.quantity} onChange={e => updateEditItem(i, 'quantity', Number(e.target.value) || 1)}
                          className="w-full border border-amber-300 rounded-lg px-2 py-1.5 text-sm text-center text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400/40" />
                      </td>
                      <td style={{ padding: '8px 6px' }}>
                        <input type="number" min="0" step="0.01" value={item.price} onChange={e => updateEditItem(i, 'price', Number(e.target.value) || 0)}
                          className="w-full border border-amber-300 rounded-lg px-2 py-1.5 text-sm text-right text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400/40" />
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600, color: '#171717' }}>{formatBRL(item.quantity * item.price)}</td>
                      <td style={{ padding: '8px 6px' }}>
                        <button onClick={() => removeEditItem(i)} className="p-1 text-slate-300 hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={5} style={{ padding: '8px 10px' }}>
                    <button onClick={addEditItem} className="inline-flex items-center gap-1.5 text-xs text-amber-700 hover:text-amber-900 font-medium"><Plus className="w-3.5 h-3.5" /> Adicionar item</button>
                  </td></tr>
                  <tr style={{ borderTop: '1px solid #fcd34d', background: '#fffbeb' }}>
                    <td colSpan={2} /><td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, color: '#92400e' }}>TOTAL</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#78350f' }}>{formatBRL(editItems.reduce((s, i) => s + i.quantity * i.price, 0))}</td>
                    <td />
                  </tr>
                  <tr style={{ background: '#fffbeb' }}>
                    <td colSpan={5} style={{ padding: '8px 10px' }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#92400e', display: 'block', marginBottom: 4 }}>Forma de pagamento</label>
                      <input value={editFormaPagamento} onChange={e => setEditFormaPagamento(e.target.value)}
                        className="w-full border border-amber-300 rounded-lg px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                        placeholder="Ex: À vista no PIX, Financiamento Santander 60x..." />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Descrição', 'Qtd', 'Unitário', 'Total'].map((h, i) => (
                    <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, color: '#6B6B68', paddingBottom: 10, borderBottom: '1.5px solid #171717', width: i === 0 ? undefined : i === 1 ? 60 : 120 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quote.items.map((item) => (
                  <tr key={item.id}>
                    <td style={{ padding: '12px 14px 12px 0', borderBottom: '1px solid #E5E2DC', fontSize: 14, fontWeight: 600, color: '#171717', verticalAlign: 'top' }}>
                      {item.name}
                      {item.kitDescription && <div style={{ marginTop: 4, fontSize: 12, fontWeight: 400, color: '#4A4A48', whiteSpace: 'pre-line', lineHeight: 1.5 }}>{item.kitDescription}</div>}
                    </td>
                    <td style={{ padding: '12px 0', borderBottom: '1px solid #E5E2DC', fontSize: 14, color: '#4A4A48', textAlign: 'right', verticalAlign: 'top' }}>{item.quantity}</td>
                    <td style={{ padding: '12px 0', borderBottom: '1px solid #E5E2DC', fontSize: 14, color: '#4A4A48', textAlign: 'right', verticalAlign: 'top' }}>{formatBRL(item.price)}</td>
                    <td style={{ padding: '12px 0', borderBottom: '1px solid #E5E2DC', fontSize: 14, fontWeight: 700, color: '#171717', textAlign: 'right', verticalAlign: 'top' }}>{formatBRL(item.quantity * item.price)}</td>
                  </tr>
                ))}
                {instCost > 0 && (
                  <tr>
                    <td style={{ padding: '12px 14px 12px 0', borderBottom: '1px solid #E5E2DC', fontSize: 14, color: '#171717' }}>Instalação</td>
                    <td style={{ padding: '12px 0', borderBottom: '1px solid #E5E2DC', textAlign: 'right', color: '#4A4A48' }}>1</td>
                    <td style={{ padding: '12px 0', borderBottom: '1px solid #E5E2DC', textAlign: 'right', color: '#4A4A48' }}>{formatBRL(instCost)}</td>
                    <td style={{ padding: '12px 0', borderBottom: '1px solid #E5E2DC', textAlign: 'right', fontWeight: 700 }}>{formatBRL(instCost)}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr style={{ background: '#FDF3EA' }}>
                  <td colSpan={2} />
                  <td className="of-narrow" style={{ padding: '14px 0', textAlign: 'right', fontWeight: 700, color: '#B15A1E', fontSize: 13 }}>TOTAL</td>
                  <td className="of-narrow" style={{ padding: '14px 0', textAlign: 'right', fontWeight: 700, color: '#B15A1E', fontSize: 22 }}>{formatBRL(subtotal)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* INVESTIMENTO + PAGAMENTO */}
        <div id="pdf-sec-financing" style={{ padding: '24px 40px', borderTop: '1px solid #E5E2DC' }}>
          <div className="of-secao-titulo">Investimento</div>
          <div style={{ background: '#FDF3EA', border: '2px solid #F6D9C2', borderRadius: 8, padding: '18px 22px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: '#B15A1E', fontWeight: 600 }}>Investimento total</div>
              {quote.fichaCliente?.formaPagamento && <div style={{ fontSize: 11, color: '#B15A1E', marginTop: 2 }}>{quote.fichaCliente.formaPagamento}</div>}
            </div>
            <div className="of-narrow" style={{ fontSize: 32, fontWeight: 700, color: '#B15A1E' }}>{formatBRL(subtotal)}</div>
          </div>
          {quote.fichaCliente?.condicoesPagamento && (
            <div style={{ background: '#FFF7F0', border: '1px solid #F6D9C2', borderRadius: 8, padding: '14px 18px' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: '#B15A1E', fontWeight: 600, marginBottom: 6 }}>Condições</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#171717' }}>{quote.fichaCliente.condicoesPagamento}</div>
              <div style={{ fontSize: 11, color: '#9A9A96', marginTop: 3 }}>Conforme acordado em contrato</div>
            </div>
          )}
          {quote.fichaCliente?.prazoEntrega && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#F5F5F3', borderRadius: 6 }}>
              <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: '#6B6B68', fontWeight: 600 }}>Prazo de entrega</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#171717' }}>{quote.fichaCliente.prazoEntrega}</span>
            </div>
          )}
        </div>

        {/* OBSERVAÇÕES */}
        {quote.fichaCliente?.observacoes && (
          <div style={{ padding: '24px 40px', borderTop: '1px solid #E5E2DC' }}>
            <div className="of-secao-titulo">Observações</div>
            <p style={{ fontSize: 14, color: '#4A4A48', lineHeight: 1.7 }}>{quote.fichaCliente.observacoes}</p>
          </div>
        )}

        {/* CONDIÇÕES GERAIS */}
        <div style={{ padding: '24px 40px', borderTop: '1px solid #E5E2DC' }}>
          <div className="of-secao-titulo">Condições Gerais</div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['Instalação, homologação e ligação da rede inclusas', 'Proposta válida por 3 dias a partir da emissão', 'Garantia de 25 anos de performance dos módulos fotovoltaicos'].map((c) => (
              <li key={c} style={{ fontSize: 13, color: '#4A4A48', paddingLeft: 16, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, color: '#B15A1E', fontWeight: 700 }}>—</span>{c}
              </li>
            ))}
          </ul>
        </div>

        {/* RODAPÉ */}
        <div id="pdf-sec-footer" style={{ padding: '20px 40px', borderTop: '1px solid #E5E2DC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: '#6B6B68', lineHeight: 1.6 }}>
            {quote.companyName || 'Aureon Energix'}<br />
            {eff.companyPhone && <span>{eff.companyPhone} · </span>}{eff.companyEmail}
          </div>
          <div style={{ fontSize: 12, color: '#6B6B68', lineHeight: 1.6, textAlign: 'right' }}>
            Válida por 3 dias<br />Sujeita a vistoria técnica
          </div>
        </div>
      </div>
    </>
  );
}
