'use client';

import React, { useState, useEffect } from 'react';
import { X, FileText, Plus, Trash2, Loader2, ExternalLink } from 'lucide-react';
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

export function QuoteFromConversationModal({ isOpen, onClose, conversation }: QuoteFromConversationModalProps) {
  const { data: products = [] } = useActiveProducts();
  const { data: boards = [] } = useBoards();
  const createDeal = useCreateDeal();
  const addDealItem = useAddDealItem();

  const [items, setItems] = useState<QuoteItem[]>([emptyItem()]);
  const [dealTitle, setDealTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const contactName = conversation.contactName || conversation.externalContactName || 'Contato';

  useEffect(() => {
    if (isOpen) {
      setDealTitle(makeTitle(contactName));
      setItems([emptyItem()]);
      setError('');
    }
  }, [isOpen, contactName]);

  if (!isOpen) return null;

  const salesBoard = boards.find(b => b.template === 'SALES') ?? boards.find(b => b.isDefault) ?? boards[0];
  const firstStage = salesBoard?.stages?.[0];

  function handleProductSelect(index: number, productId: string) {
    const product = products.find((p: Product) => p.id === productId);
    setItems(prev => prev.map((item, i) =>
      i !== index ? item : {
        ...item,
        productId,
        name: product?.name ?? '',
        price: product?.price ?? 0,
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
  const validItems = items.filter(i => i.name.trim() && i.price >= 0);

  async function handleGenerate() {
    if (!validItems.length) { setError('Adicione ao menos um produto com nome.'); return; }
    if (!salesBoard || !firstStage) { setError('Nenhum board de vendas encontrado. Crie um board antes.'); return; }
    if (!conversation.contactId) { setError('Vincule um contato a esta conversa antes de gerar o orçamento.'); return; }

    setIsCreating(true);
    setError('');

    try {
      let dealId: string;

      // Tenta criar novo deal
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

        // Deal já existe para este contato+estágio → buscar o existente
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
        // Limpa itens anteriores para não duplicar
        await supabase!.from('deal_items').delete().eq('deal_id', dealId);
      }

      // Adicionar itens ao deal (novo ou existente)
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

      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 flex flex-col max-h-[90vh]">
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
              {items.map((item, index) => (
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

                  <div className="flex gap-2">
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
                    <div className="w-28 flex flex-col justify-end">
                      <label className="block text-[10px] text-slate-400 mb-0.5">Subtotal</label>
                      <p className="text-sm font-bold text-slate-900 dark:text-white py-1.5">
                        R$ {(item.price * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
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

          {/* Total */}
          <div className="flex items-center justify-between rounded-xl bg-primary-50 dark:bg-primary-500/10 border border-primary-100 dark:border-primary-500/20 px-4 py-3">
            <span className="text-sm font-semibold text-primary-700 dark:text-primary-300">Total do orçamento</span>
            <span className="text-lg font-bold text-primary-700 dark:text-primary-300">
              R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
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
