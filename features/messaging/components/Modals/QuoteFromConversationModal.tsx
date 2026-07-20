'use client';

import React, { useState, useEffect } from 'react';
import { X, FileText, Plus, Trash2, Loader2, ExternalLink, Sparkles, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
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

function emptyItem(): QuoteItem {
  return { productId: '', name: '', price: 0, quantity: 1 };
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

  // Estado da extração solar com IA
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [extracted, setExtracted] = useState<SolarExtracted | null>(null);
  const [showExtracted, setShowExtracted] = useState(true);

  const contactName = conversation.contactName || conversation.externalContactName || 'Contato';

  useEffect(() => {
    if (isOpen) {
      setDealTitle(makeTitle(contactName));
      setItems([emptyItem()]);
      setError('');
      setExtracted(null);
      setAiError('');
    }
  }, [isOpen, contactName]);

  if (!isOpen) return null;

  const salesBoard = boards.find(b => b.template === 'SALES') ?? boards.find(b => b.isDefault) ?? boards[0];
  const firstStage = salesBoard?.stages?.[0];

  // Extrair dados solares da conversa via IA
  async function handleAIExtract() {
    setAiLoading(true);
    setAiError('');
    try {
      const res = await fetch('/api/ai/tasks/quote/solar-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conversation.id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setAiError(data.error?.message || 'Erro ao analisar conversa com IA.');
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

  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const totalCost = items.reduce((s, i) => s + (i.costPrice ?? 0) * i.quantity, 0);
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

          {/* Itens */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Produtos / serviços</label>

            <div className="space-y-2">
              {items.map((item, index) => {
                const margin = calcMargin(item.price * item.quantity, (item.costPrice ?? 0) * item.quantity);
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
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.price}
                          onChange={e => handleFieldChange(index, 'price', Number(e.target.value))}
                          className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-400"
                        />
                      </div>
                      <div className="w-20">
                        <label className="block text-[10px] text-slate-400 mb-0.5">Qtd</label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={e => handleFieldChange(index, 'quantity', parseInt(e.target.value) || 1)}
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
                          Margem: {margin} · Custo total: {formatBRL((item.costPrice ?? 0) * item.quantity)}
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
