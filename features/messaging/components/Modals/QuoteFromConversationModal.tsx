'use client';

import React, { useState, useEffect } from 'react';
import { X, FileText, Plus, Trash2, Loader2, ExternalLink, Sparkles, ChevronDown, ChevronUp, TrendingUp, Paperclip, ImageIcon, Receipt } from 'lucide-react';
import { useActiveProducts } from '@/lib/query/hooks/useProductsQuery';
import { useBoards, useCreateDeal, useAddDealItem } from '@/lib/query/hooks';
import { supabase } from '@/lib/supabase/client';
import type { ConversationView } from '@/lib/messaging/types';
import type { Product } from '@/types';

interface QuoteItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  // Custo total interno (kit + serviços) para cálculo de margem
  costPrice?: number;
}

interface SolarExtracted {
  kwhMonth: number | null;
  city: string | null;
  state: string | null;
  distributor: string | null;
  currentBillValue: number | null;
  systemPowerKwp: number | null;
  observations: string | null;
  confidence: number;
}

interface QuoteFromConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversation: ConversationView;
}

interface InternalCosts {
  nfPercent: string;
  corrugado: string;
  eletroduto: string;
  estruturaTipo: 'solo' | 'telhado' | 'laje';
  estrutura: string;
  cabos: string;
  campoKwp: string; // R$ por kWp instalado
}

const DEFAULT_COSTS: InternalCosts = {
  nfPercent: '',
  corrugado: '',
  eletroduto: '',
  estruturaTipo: 'telhado',
  estrutura: '',
  cabos: '',
  campoKwp: '',
};

const COSTS_KEY = 'nossocrm-internal-costs-v1';

function loadCosts(): InternalCosts {
  if (typeof window === 'undefined') return DEFAULT_COSTS;
  try {
    const raw = localStorage.getItem(COSTS_KEY);
    return raw ? { ...DEFAULT_COSTS, ...JSON.parse(raw) } : DEFAULT_COSTS;
  } catch { return DEFAULT_COSTS; }
}

function saveCosts(c: InternalCosts) {
  try { localStorage.setItem(COSTS_KEY, JSON.stringify(c)); } catch { /* ignore */ }
}

function emptyItem(): QuoteItem {
  return { productId: '', name: '', price: 0, quantity: 1 };
}

// Input numérico que aceita vírgula como separador decimal (padrão BR)
// e resolve o bug do zero travado em campos controlados
function DecimalInput({
  value,
  onChange,
  className,
  placeholder,
  min,
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  placeholder?: string;
  min?: number;
}) {
  const [text, setText] = React.useState(() =>
    value === 0 ? '' : String(value).replace('.', ',')
  );

  // Sincroniza quando o valor externo muda (ex: produto selecionado do catálogo)
  const prevValue = React.useRef(value);
  React.useEffect(() => {
    if (prevValue.current !== value) {
      prevValue.current = value;
      setText(value === 0 ? '' : String(value).replace('.', ','));
    }
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      value={text}
      className={className}
      onChange={e => {
        const raw = e.target.value;
        setText(raw);
        const n = parseFloat(raw.replace(',', '.'));
        if (!isNaN(n)) onChange(n);
        else if (raw === '' || raw === '-') onChange(0);
      }}
      onBlur={() => {
        const n = parseFloat(text.replace(',', '.'));
        const safe = isNaN(n) ? (min ?? 0) : (min !== undefined ? Math.max(min, n) : n);
        setText(safe === 0 && min === undefined ? '' : String(safe).replace('.', ','));
        onChange(safe);
      }}
      onFocus={e => e.target.select()}
    />
  );
}

function makeTitle(contactName: string): string {
  const now = new Date();
  const date = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `Orçamento — ${contactName} (${date} ${time})`;
}

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function calcMargin(price: number, cost: number | undefined): string | null {
  if (!cost || cost <= 0 || price <= 0) return null;
  const margin = ((price - cost) / price) * 100;
  return `${margin.toFixed(1)}%`;
}

export function QuoteFromConversationModal({ isOpen, onClose, conversation }: QuoteFromConversationModalProps) {
  const { data: products = [] } = useActiveProducts();
  const { data: boards = [] } = useBoards();
  const createDeal = useCreateDeal();
  const addDealItem = useAddDealItem();

  const [items, setItems] = useState<QuoteItem[]>([emptyItem()]);
  const [dealTitle, setDealTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  // Custos internos configuráveis — persistidos no localStorage
  const [costs, setCosts] = useState<InternalCosts>(loadCosts);
  const [showCosts, setShowCosts] = useState(false);

  function updateCost<K extends keyof InternalCosts>(key: K, value: InternalCosts[K]) {
    setCosts(prev => {
      const next = { ...prev, [key]: value };
      saveCosts(next);
      return next;
    });
  }

  // Estado da extração solar com IA
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [extracted, setExtracted] = useState<SolarExtracted | null>(null);
  const [showExtracted, setShowExtracted] = useState(true);

  // Arquivos anexados
  const [billFile, setBillFile] = useState<File | null>(null);          // Conta de energia
  const [supplierFile, setSupplierFile] = useState<File | null>(null);  // Orçamento do fornecedor

  const contactName = conversation.contactName || conversation.externalContactName || 'Contato';

  useEffect(() => {
    if (isOpen) {
      setDealTitle(makeTitle(contactName));
      setItems([emptyItem()]);
      setError('');
      setExtracted(null);
      setAiError('');
      setBillFile(null);
      setSupplierFile(null);
    }
  }, [isOpen, contactName]);

  if (!isOpen) return null;

  const salesBoard = boards.find(b => b.template === 'SALES') ?? boards.find(b => b.isDefault) ?? boards[0];
  const firstStage = salesBoard?.stages?.[0];

  // Converter arquivo em base64
  async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove o prefixo "data:...;base64," e retorna só os dados
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Extrair dados solares da conversa e/ou imagem da conta via IA
  async function handleAIExtract() {
    setAiLoading(true);
    setAiError('');
    try {
      const payload: Record<string, string> = {
        conversationId: conversation.id,
      };

      // Se tem imagem da conta, converte para base64 e envia para extração visual
      if (billFile) {
        payload.billImageBase64 = await fileToBase64(billFile);
        payload.billImageMimeType = billFile.type || 'image/jpeg';
      }

      const res = await fetch('/api/ai/tasks/quote/solar-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setAiError(data.error?.message || 'Erro ao analisar com IA.');
        return;
      }
      setExtracted(data.extracted);
      setShowExtracted(true);
    } catch {
      setAiError('Erro de conexão ao chamar IA.');
    } finally {
      setAiLoading(false);
    }
  }

  function handleProductSelect(index: number, productId: string) {
    const product = products.find((p: Product) => p.id === productId);
    setItems(prev => prev.map((item, i) =>
      i !== index ? item : {
        ...item,
        productId,
        name: product?.name ?? '',
        price: product?.price ?? 0,
        costPrice: product?.costPrice ?? undefined,
      }
    ));
  }

  function handleFieldChange(index: number, field: keyof QuoteItem, value: string | number) {
    setItems(prev => prev.map((item, i) =>
      i !== index ? item : { ...item, [field]: value }
    ));
  }

  function addItem() {
    setItems(prev => [...prev, emptyItem()]);
  }

  function removeItem(index: number) {
    if (items.length === 1) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  }

  // kWp total: usa dado da IA quando disponível, senão soma as quantidades dos itens
  const totalKwp = extracted?.systemPowerKwp ?? items.reduce((s, i) => s + i.quantity, 0);

  // NF multiplica o custo dos produtos
  const nfFactor = 1 + (parseFloat(costs.nfPercent.replace(',', '.')) || 0) / 100;

  // Custos fixos internos (corrugado, eletroduto, estrutura, cabos)
  const parseCost = (s: string) => parseFloat(s.replace(',', '.')) || 0;
  const fixedInternal =
    parseCost(costs.corrugado) +
    parseCost(costs.eletroduto) +
    parseCost(costs.estrutura) +
    parseCost(costs.cabos);
  const campoTotal = parseCost(costs.campoKwp) * totalKwp;
  const totalInternal = fixedInternal + campoTotal;

  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const totalProductCost = items.reduce((s, i) => s + (i.costPrice ?? 0) * nfFactor * i.quantity, 0);
  const totalCost = totalProductCost + totalInternal;
  const totalMargin = total > 0 && totalCost > 0 ? ((total - totalCost) / total) * 100 : null;
  const validItems = items.filter(i => i.name.trim() && i.price >= 0);

  // Monta a URL do OrçaFácil com dados pré-preenchidos
  function buildOrcafacilUrl(): string {
    const base = 'https://app-eight-eta-92.vercel.app';
    const params = new URLSearchParams();
    if (contactName && contactName !== 'Contato') params.set('cliente', contactName);
    if (extracted?.kwhMonth) params.set('kwh', String(extracted.kwhMonth));
    if (extracted?.city) params.set('cidade', extracted.city);
    if (extracted?.state) params.set('uf', extracted.state);
    if (extracted?.distributor) params.set('distribuidora', extracted.distributor);
    if (extracted?.currentBillValue) params.set('conta', String(extracted.currentBillValue));
    if (conversation.contactPhone) params.set('telefone', conversation.contactPhone);
    const qs = params.toString();
    return qs ? `${base}/?${qs}` : base;
  }

  async function handleGenerate() {
    if (!validItems.length) { setError('Adicione ao menos um produto com nome.'); return; }
    if (!salesBoard || !firstStage) { setError('Nenhum board de vendas encontrado. Crie um board antes.'); return; }
    if (!conversation.contactId) { setError('Vincule um contato a esta conversa antes de gerar o orçamento.'); return; }

    setIsCreating(true);
    setError('');

    try {
      let dealId: string;

      try {
        const deal = await createDeal.mutateAsync({
          title: dealTitle.trim() || makeTitle(contactName),
          contactId: conversation.contactId!,
          boardId: salesBoard.id,
          status: firstStage.id,
          value: total,
          items: [],
          probability: 50,
          priority: 'medium',
          owner: { name: '', avatar: '' },
          tags: [],
        });
        dealId = deal.id;
      } catch (e: unknown) {
        const msg = (e as Error)?.message ?? '';
        const lowerMsg = msg.toLowerCase();
        const isDuplicate =
          lowerMsg.includes('duplicate') ||
          lowerMsg.includes('unique') ||
          lowerMsg.includes('já existe') ||
          lowerMsg.includes('ja existe') ||
          lowerMsg.includes('negócio');

        if (!isDuplicate) throw e;

        const { data: existing } = await supabase!
          .from('deals')
          .select('id')
          .eq('contact_id', conversation.contactId!)
          .eq('is_won', false)
          .eq('is_lost', false)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!existing?.id) throw new Error('Não foi possível criar nem localizar o negócio para este contato.');
        dealId = existing.id;
        setError('');
        await supabase!.from('deal_items').delete().eq('deal_id', dealId);
      }

      for (const item of validItems) {
        await addDealItem.mutateAsync({
          dealId,
          item: {
            productId: item.productId || '',
            name: item.name,
            price: item.price,
            quantity: item.quantity,
          },
        });
      }

      window.open(`/deals/${dealId}/quote`, '_blank');
      onClose();
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? '';
      setError(msg || 'Erro ao gerar orçamento.');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary-500" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Gerar Orçamento</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Cliente */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Cliente</label>
            <p className="text-sm font-medium text-slate-900 dark:text-white">{contactName}</p>
          </div>

          {/* Bloco de IA Solar */}
          <div className="rounded-xl border border-primary-200 dark:border-primary-500/30 bg-primary-50 dark:bg-primary-500/5 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                <span className="text-xs font-bold text-primary-700 dark:text-primary-300 uppercase tracking-wide">Análise IA da conversa</span>
              </div>
              <div className="flex items-center gap-2">
                {extracted && (
                  <button
                    type="button"
                    onClick={() => setShowExtracted(v => !v)}
                    className="p-1 text-primary-500 hover:text-primary-700 transition-colors"
                  >
                    {showExtracted ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAIExtract}
                  disabled={aiLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white transition-colors"
                >
                  {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {aiLoading ? 'Analisando…' : extracted ? 'Re-analisar' : 'Analisar'}
                </button>
              </div>
            </div>

            {/* Dados extraídos */}
            {extracted && showExtracted && (
              <div className="px-3 pb-3 space-y-2 border-t border-primary-200 dark:border-primary-500/20 pt-2">
                <div className="grid grid-cols-2 gap-2">
                  {extracted.kwhMonth !== null && (
                    <div className="rounded-lg bg-white dark:bg-slate-800 px-3 py-2 border border-slate-100 dark:border-white/10">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Consumo mensal</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{extracted.kwhMonth} kWh</p>
                    </div>
                  )}
                  {extracted.currentBillValue !== null && (
                    <div className="rounded-lg bg-white dark:bg-slate-800 px-3 py-2 border border-slate-100 dark:border-white/10">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Valor da conta</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{formatBRL(extracted.currentBillValue)}</p>
                    </div>
                  )}
                  {extracted.city && (
                    <div className="rounded-lg bg-white dark:bg-slate-800 px-3 py-2 border border-slate-100 dark:border-white/10">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Cidade</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{extracted.city}{extracted.state ? ` - ${extracted.state}` : ''}</p>
                    </div>
                  )}
                  {extracted.distributor && (
                    <div className="rounded-lg bg-white dark:bg-slate-800 px-3 py-2 border border-slate-100 dark:border-white/10">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Distribuidora</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{extracted.distributor}</p>
                    </div>
                  )}
                  {extracted.systemPowerKwp !== null && (
                    <div className="rounded-lg bg-white dark:bg-slate-800 px-3 py-2 border border-slate-100 dark:border-white/10">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Potência estimada</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{extracted.systemPowerKwp} kWp</p>
                    </div>
                  )}
                </div>
                {extracted.observations && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 italic">{extracted.observations}</p>
                )}

                {/* Link para OrçaFácil */}
                {extracted.kwhMonth !== null && (
                  <a
                    href={buildOrcafacilUrl()}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 w-full px-3 py-2 text-xs font-bold rounded-lg border border-primary-300 dark:border-primary-500/40 text-primary-700 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-500/10 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir no OrçaFácil com dados pré-preenchidos
                  </a>
                )}
              </div>
            )}

            {/* Uploads de arquivo */}
            <div className="px-3 pb-3 space-y-2 border-t border-primary-200 dark:border-primary-500/20 pt-2">
              {/* Conta de energia */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
                  <Receipt className="w-3 h-3" /> Conta de energia (opcional — melhora a extração)
                </label>
                <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-white/20 cursor-pointer hover:border-primary-400 transition-colors">
                  <Paperclip className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {billFile ? billFile.name : 'Anexar foto ou PDF da conta'}
                  </span>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={e => setBillFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                {billFile && (
                  <button type="button" onClick={() => setBillFile(null)} className="text-[10px] text-red-400 hover:text-red-600 mt-0.5">
                    Remover
                  </button>
                )}
              </div>

              {/* Orçamento do fornecedor */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Orçamento do fornecedor (referência de custo)
                </label>
                <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-white/20 cursor-pointer hover:border-primary-400 transition-colors">
                  <Paperclip className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {supplierFile ? supplierFile.name : 'Anexar PDF ou imagem do orçamento'}
                  </span>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={e => setSupplierFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                {supplierFile && (
                  <button type="button" onClick={() => setSupplierFile(null)} className="text-[10px] text-red-400 hover:text-red-600 mt-0.5">
                    Remover
                  </button>
                )}
              </div>
            </div>

            {aiError && (
              <p className="px-3 pb-3 text-xs text-red-500">{aiError}</p>
            )}
          </div>

          {/* Título */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Título do negócio</label>
            <input
              type="text"
              value={dealTitle}
              onChange={e => setDealTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
            />
          </div>

          {/* Custos Internos */}
          <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/3 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowCosts(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Custos Internos</span>
                {totalInternal > 0 && (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                    {formatBRL(totalInternal)} adicional
                  </span>
                )}
              </div>
              {showCosts
                ? <ChevronUp className="w-4 h-4 text-slate-400" />
                : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {showCosts && (
              <div className="px-4 pb-4 space-y-3 border-t border-slate-200 dark:border-white/10 pt-3">
                {/* NF */}
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="block text-[10px] text-slate-400 mb-0.5">NF — Nota Fiscal (%)</label>
                    <div className="flex items-center gap-1">
                      <DecimalInput
                        value={parseCost(costs.nfPercent)}
                        min={0}
                        onChange={v => updateCost('nfPercent', v === 0 ? '' : String(v).replace('.', ','))}
                        placeholder="0"
                        className="w-20 px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-400"
                      />
                      <span className="text-sm text-slate-400">%</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-4 flex-1">Aplicado sobre o custo dos produtos do catálogo</p>
                </div>

                {/* Corrugado + Eletroduto */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">Corrugado (R$)</label>
                    <DecimalInput
                      value={parseCost(costs.corrugado)}
                      min={0}
                      onChange={v => updateCost('corrugado', v === 0 ? '' : String(v).replace('.', ','))}
                      placeholder="0,00"
                      className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">Eletroduto (R$)</label>
                    <DecimalInput
                      value={parseCost(costs.eletroduto)}
                      min={0}
                      onChange={v => updateCost('eletroduto', v === 0 ? '' : String(v).replace('.', ','))}
                      placeholder="0,00"
                      className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-400"
                    />
                  </div>
                </div>

                {/* Estrutura */}
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">Estrutura (R$)</label>
                  <div className="flex items-center gap-2">
                    <select
                      value={costs.estruturaTipo}
                      onChange={e => updateCost('estruturaTipo', e.target.value as InternalCosts['estruturaTipo'])}
                      className="w-32 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-400"
                    >
                      <option value="telhado">Telhado</option>
                      <option value="solo">Solo</option>
                      <option value="laje">Laje</option>
                    </select>
                    <DecimalInput
                      value={parseCost(costs.estrutura)}
                      min={0}
                      onChange={v => updateCost('estrutura', v === 0 ? '' : String(v).replace('.', ','))}
                      placeholder="0,00"
                      className="flex-1 px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-400"
                    />
                  </div>
                </div>

                {/* Cabos */}
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">Cabos (R$)</label>
                  <DecimalInput
                    value={parseCost(costs.cabos)}
                    min={0}
                    onChange={v => updateCost('cabos', v === 0 ? '' : String(v).replace('.', ','))}
                    placeholder="0,00"
                    className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-400"
                  />
                </div>

                {/* Campo — R$/kWp */}
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">Campo — valor por kWp instalado</label>
                  <div className="flex items-center gap-2">
                    <DecimalInput
                      value={parseCost(costs.campoKwp)}
                      min={0}
                      onChange={v => updateCost('campoKwp', v === 0 ? '' : String(v).replace('.', ','))}
                      placeholder="0,00"
                      className="w-32 px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-400"
                    />
                    <span className="text-xs text-slate-400">R$/kWp</span>
                    {parseCost(costs.campoKwp) > 0 && (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        = {formatBRL(campoTotal)} ({totalKwp.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kWp)
                      </span>
                    )}
                  </div>
                </div>

                {/* Resumo dos custos internos */}
                {totalInternal > 0 && (
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-white/10">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Total custos internos</span>
                    <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{formatBRL(totalInternal)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Itens */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Produtos / serviços</label>

            <div className="space-y-2">
              {items.map((item, index) => {
                const effectiveCost = (item.costPrice ?? 0) * nfFactor;
                const margin = calcMargin(item.price * item.quantity, effectiveCost * item.quantity);
                return (
                  <div key={index} className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/3 p-3 space-y-2">
                    <div className="flex gap-2">
                      <select
                        value={item.productId}
                        onChange={e => handleProductSelect(index, e.target.value)}
                        className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-400"
                      >
                        <option value="">Selecionar do catálogo…</option>
                        {products.map((p: Product) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — R$ {p.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </option>
                        ))}
                      </select>
                      {items.length > 1 && (
                        <button type="button" onClick={() => removeItem(index)} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <input
                      type="text"
                      placeholder="Nome do produto/serviço"
                      value={item.name}
                      onChange={e => handleFieldChange(index, 'name', e.target.value)}
                      className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
                    />

                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <label className="block text-[10px] text-slate-400 mb-0.5">Preço (R$)</label>
                        <DecimalInput
                          value={item.price}
                          min={0}
                          onChange={v => handleFieldChange(index, 'price', v)}
                          placeholder="0,00"
                          className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-400"
                        />
                      </div>
                      <div className="w-24">
                        <label className="block text-[10px] text-slate-400 mb-0.5">Qtd / kWp</label>
                        <DecimalInput
                          value={item.quantity}
                          min={0}
                          onChange={v => handleFieldChange(index, 'quantity', v || 1)}
                          placeholder="1"
                          className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-400"
                        />
                      </div>
                      <div className="w-28 flex flex-col">
                        <label className="block text-[10px] text-slate-400 mb-0.5">Subtotal</label>
                        <p className="text-sm font-bold text-slate-900 dark:text-white py-1.5">
                          {formatBRL(item.price * item.quantity)}
                        </p>
                      </div>
                    </div>

                    {/* Badge de margem — só aparece quando o produto tem custo cadastrado */}
                    {margin && (
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="w-3 h-3 text-emerald-500" />
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                          Margem: {margin} · Custo c/ NF: {formatBRL(effectiveCost * item.quantity)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addItem}
              className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-dashed border-slate-300 dark:border-white/20 text-slate-500 dark:text-slate-400 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar outro produto
            </button>
          </div>

          {/* Total + Margem geral */}
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-xl bg-primary-50 dark:bg-primary-500/10 border border-primary-100 dark:border-primary-500/20 px-4 py-3">
              <span className="text-sm font-semibold text-primary-700 dark:text-primary-300">Total do orçamento</span>
              <span className="text-lg font-bold text-primary-700 dark:text-primary-300">
                {formatBRL(total)}
              </span>
            </div>
            {totalMargin !== null && (
              <div className="flex items-center justify-between rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Margem de lucro</span>
                </div>
                <div className="text-right">
                  <span className="text-base font-bold text-emerald-700 dark:text-emerald-300">{totalMargin.toFixed(1)}%</span>
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Lucro: {formatBRL(total - totalCost)}</p>
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 dark:border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isCreating || !validItems.length}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white transition-colors"
          >
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
            {isCreating ? 'Gerando…' : 'Gerar Orçamento'}
          </button>
        </div>
      </div>
    </div>
  );
}
