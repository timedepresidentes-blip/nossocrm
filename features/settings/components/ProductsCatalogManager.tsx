'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Package, Pencil, Plus, Save, Trash2, ToggleLeft, ToggleRight, X } from 'lucide-react';
import { productsService } from '@/lib/supabase';
import type { Product, ProductCharacteristic } from '@/types';

function formatBRL(v: number) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  } catch {
    return `R$ ${v.toFixed(2)}`;
  }
}

function calcMargin(price: number, cost: number): string {
  if (!cost || cost <= 0) return '—';
  const margin = ((price - cost) / price) * 100;
  return `${margin.toFixed(1)}%`;
}

// Formulário inline para criar/editar produto
function ProductForm({
  initial,
  onSave,
  onCancel,
  loading,
}: {
  initial?: Partial<Product>;
  onSave: (data: Omit<Product, 'id' | 'organizationId' | 'active'>) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [price, setPrice] = useState(String(initial?.price ?? '0'));
  const [costPrice, setCostPrice] = useState(String(initial?.costPrice ?? '0'));
  const [sku, setSku] = useState(initial?.sku ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [observations, setObservations] = useState(initial?.observations ?? '');
  const [characteristics, setCharacteristics] = useState<ProductCharacteristic[]>(initial?.characteristics ?? []);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [expanded, setExpanded] = useState(false);

  const canSave = name.trim().length > 1 && Number.isFinite(Number(price)) && Number(price) >= 0;

  const addCharacteristic = () => {
    if (!newKey.trim()) return;
    setCharacteristics((prev) => [...prev, { key: newKey.trim(), value: newValue.trim() }]);
    setNewKey('');
    setNewValue('');
  };

  const removeCharacteristic = (i: number) => {
    setCharacteristics((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      price: Number(price),
      costPrice: Number(costPrice),
      sku: sku.trim() || undefined,
      description: description.trim() || undefined,
      observations: observations.trim() || undefined,
      characteristics,
    });
  };

  const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40';

  return (
    <div className="border border-primary-200 dark:border-primary-800 rounded-2xl p-4 bg-primary-50/40 dark:bg-primary-900/10 space-y-3">
      {/* Linha 1: Nome + preços */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        <div className="sm:col-span-5">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Nome *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Painel Solar 555W, Inversor..." className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Preço de venda *</label>
          <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Custo</label>
          <input value={costPrice} onChange={(e) => setCostPrice(e.target.value)} inputMode="decimal" className={inputCls} />
        </div>
        <div className="sm:col-span-1 flex items-end">
          <div className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs text-slate-500 dark:text-slate-400 text-center">
            <div className="font-bold text-slate-700 dark:text-slate-200">{calcMargin(Number(price), Number(costPrice))}</div>
            <div>margem</div>
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">SKU</label>
          <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Opcional" className={inputCls} />
        </div>
      </div>

      {/* Linha 2: Descrição */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Descrição curta</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Resumo para o orçamento" className={inputCls} />
      </div>

      {/* Expansível: observações + características */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 font-medium"
      >
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {expanded ? 'Ocultar' : 'Observações e características técnicas'}
      </button>

      {expanded && (
        <div className="space-y-3 pt-1">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Observações internas</label>
            <textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              rows={3}
              placeholder="Notas internas, condições de garantia, fornecedor..."
              className={inputCls + ' resize-none'}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Características técnicas</label>
            <div className="space-y-2">
              {characteristics.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300 w-32 shrink-0">{c.key}</span>
                  <span className="text-xs text-slate-800 dark:text-slate-200 flex-1">{c.value}</span>
                  <button type="button" onClick={() => removeCharacteristic(i)} className="text-red-400 hover:text-red-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <input
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="Campo (ex.: Potência)"
                    className={inputCls + ' text-xs'}
                    onKeyDown={(e) => e.key === 'Enter' && addCharacteristic()}
                  />
                </div>
                <div className="flex-1">
                  <input
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder="Valor (ex.: 555 Wp)"
                    className={inputCls + ' text-xs'}
                    onKeyDown={(e) => e.key === 'Enter' && addCharacteristic()}
                  />
                </div>
                <button
                  type="button"
                  onClick={addCharacteristic}
                  disabled={!newKey.trim()}
                  className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-200 text-xs font-medium hover:bg-slate-300 dark:hover:bg-white/20 disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ações */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || !canSave}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-bold hover:bg-primary-500 disabled:opacity-50"
        >
          <Save className="w-4 h-4" /> Salvar
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 text-sm hover:bg-slate-50 dark:hover:bg-white/5"
        >
          <X className="w-4 h-4" /> Cancelar
        </button>
      </div>
    </div>
  );
}

export const ProductsCatalogManager: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const res = await productsService.getAll();
    if (res.error) {
      setError(res.error.message);
      setProducts([]);
    } else {
      setProducts(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (process.env.NODE_ENV === 'test') return;
    load();
  }, []);

  const sorted = useMemo(() => {
    const list = [...products];
    list.sort((a, b) => {
      const aActive = a.active !== false;
      const bActive = b.active !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    });
    return list;
  }, [products]);

  const notify = () => {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('crm:products-updated'));
  };

  const handleCreate = async (data: Omit<Product, 'id' | 'organizationId' | 'active'>) => {
    setLoading(true);
    setError(null);
    const res = await productsService.create({ ...data });
    if (res.error) { setError(res.error.message); setLoading(false); return; }
    setCreating(false);
    await load();
    notify();
  };

  const handleUpdate = async (id: string, data: Omit<Product, 'id' | 'organizationId' | 'active'>) => {
    setLoading(true);
    setError(null);
    const res = await productsService.update(id, { ...data });
    if (res.error) { setError(res.error.message); setLoading(false); return; }
    setEditingId(null);
    await load();
    notify();
  };

  const toggleActive = async (p: Product, next: boolean) => {
    setLoading(true);
    const res = await productsService.update(p.id, { active: next });
    if (res.error) setError(res.error.message);
    await load();
    notify();
  };

  const remove = async (p: Product) => {
    if (!window.confirm(`Excluir "${p.name}"? Itens já usados em deals históricos não são afetados.`)) return;
    setLoading(true);
    const res = await productsService.delete(p.id);
    if (res.error) setError(res.error.message);
    await load();
    notify();
  };

  return (
    <div className="mb-12">
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-6 mb-5">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <Package className="h-5 w-5" /> Produtos / Serviços
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Catálogo com custo, margem e características técnicas. Usado para gerar orçamentos nos deals.
            </p>
          </div>
          {!creating && (
            <button
              type="button"
              onClick={() => { setCreating(true); setEditingId(null); }}
              className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-bold hover:bg-primary-500"
            >
              <Plus className="h-4 w-4" /> Novo produto
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
            {error}
          </div>
        )}

        {creating && (
          <div className="mb-4">
            <ProductForm
              onSave={handleCreate}
              onCancel={() => setCreating(false)}
              loading={loading}
            />
          </div>
        )}

        <div className="space-y-2 border-t border-slate-200 dark:border-white/10 pt-4">
          {sorted.length === 0 && !creating && (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-6">Nenhum produto cadastrado ainda.</p>
          )}
          {sorted.map((p) => {
            const isActive = p.active !== false;
            const isEditing = editingId === p.id;
            const isExpanded = expandedId === p.id;
            const hasExtras = (p.characteristics?.length ?? 0) > 0 || p.observations;

            if (isEditing) {
              return (
                <div key={p.id}>
                  <ProductForm
                    initial={p}
                    onSave={(data) => handleUpdate(p.id, data)}
                    onCancel={() => setEditingId(null)}
                    loading={loading}
                  />
                </div>
              );
            }

            return (
              <div key={p.id} className={`rounded-xl border ${isActive ? 'border-slate-200 dark:border-white/10' : 'border-slate-100 dark:border-white/5 opacity-60'} bg-slate-50/60 dark:bg-white/3`}>
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white truncate">{p.name}</span>
                      {!isActive && <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-white/10 text-slate-500">Inativo</span>}
                      {p.sku && <span className="text-[11px] text-slate-400">SKU: {p.sku}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-xs font-medium text-primary-600 dark:text-primary-400">{formatBRL(p.price)}</span>
                      {(p.costPrice ?? 0) > 0 && (
                        <>
                          <span className="text-xs text-slate-400">custo {formatBRL(p.costPrice!)}</span>
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium">{calcMargin(p.price, p.costPrice!)} margem</span>
                        </>
                      )}
                      {p.description && <span className="text-xs text-slate-500 truncate max-w-[200px]">{p.description}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {hasExtras && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : p.id)}
                        className="px-2 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10"
                        title="Ver características"
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                      </button>
                    )}
                    <button type="button" onClick={() => { setEditingId(p.id); setCreating(false); }} className="px-2 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10" title="Editar">
                      <Pencil className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                    </button>
                    <button type="button" onClick={() => toggleActive(p, !isActive)} className="px-2 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10" title={isActive ? 'Desativar' : 'Ativar'}>
                      {isActive ? <ToggleRight className="h-4 w-4 text-green-600" /> : <ToggleLeft className="h-4 w-4 text-red-500" />}
                    </button>
                    <button type="button" onClick={() => remove(p)} className="px-2 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-red-50 dark:hover:bg-red-900/20" title="Excluir">
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </button>
                  </div>
                </div>

                {isExpanded && hasExtras && (
                  <div className="px-4 pb-3 border-t border-slate-100 dark:border-white/5 pt-3 space-y-2">
                    {(p.characteristics?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {p.characteristics!.map((c, i) => (
                          <span key={i} className="text-xs bg-slate-100 dark:bg-white/10 px-2 py-1 rounded-lg text-slate-700 dark:text-slate-300">
                            <span className="font-medium">{c.key}:</span> {c.value}
                          </span>
                        ))}
                      </div>
                    )}
                    {p.observations && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 italic">{p.observations}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
