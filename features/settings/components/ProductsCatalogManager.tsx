'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Package, Pencil, Plus, Save, Trash2, ToggleLeft, ToggleRight, X } from 'lucide-react';
import { productsService } from '@/lib/supabase';
import type { Product, ProductCharacteristic, ProductCostItem } from '@/types';

function formatBRL(v: number) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  } catch {
    return `R$ ${v.toFixed(2)}`;
  }
}

function calcMargin(price: number, cost: number): string {
  if (!cost || cost <= 0 || price <= 0) return '—';
  const margin = ((price - cost) / price) * 100;
  return `${margin.toFixed(1)}%`;
}

function totalCost(items: { label: string; value: string }[]): number {
  return items.reduce((s, i) => s + (Number(i.value) || 0), 0);
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
  const [sku, setSku] = useState(initial?.sku ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [observations, setObservations] = useState(initial?.observations ?? '');
  const [characteristics, setCharacteristics] = useState<ProductCharacteristic[]>(initial?.characteristics ?? []);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [expanded, setExpanded] = useState(false);

  // Kit de equipamentos
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '');
  const [kitImages, setKitImages] = useState<{ label: string; url: string }[]>(initial?.kitImages ?? []);
  const [hasKit, setHasKit] = useState(!!(initial?.kitDescription || (initial?.kitCost ?? 0) > 0));
  const [kitDescription, setKitDescription] = useState(initial?.kitDescription ?? '');
  const [kitCost, setKitCost] = useState(String(initial?.kitCost ?? ''));

  // Serviços e outros custos adicionais
  const seedCostItems = (): { label: string; value: string }[] => {
    if (initial?.costItems?.length) {
      return initial.costItems.map((i) => ({ label: i.label, value: String(i.value) }));
    }
    return [];
  };
  const [costItems, setCostItems] = useState<{ label: string; value: string }[]>(seedCostItems);

  const kitCostNum = Number(kitCost) || 0;
  const servicesCost = totalCost(costItems);
  const cost = kitCostNum + servicesCost;
  const canSave = name.trim().length > 1 && Number.isFinite(Number(price)) && Number(price) >= 0;

  const addCostItem = () => setCostItems((prev) => [...prev, { label: '', value: '' }]);

  const updateCostItem = (i: number, field: 'label' | 'value', val: string) => {
    setCostItems((prev) => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  };

  const removeCostItem = (i: number) => {
    setCostItems((prev) => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : [{ label: '', value: '' }]);
  };

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
    const items: ProductCostItem[] = costItems
      .filter((i) => i.label.trim() || Number(i.value) > 0)
      .map((i) => ({ label: i.label.trim() || 'Serviço', value: Number(i.value) || 0 }));
    const kc = hasKit ? (Number(kitCost) || 0) : 0;
    onSave({
      name: name.trim(),
      price: Number(price),
      costPrice: kc + items.reduce((s, i) => s + i.value, 0),
      costItems: items,
      kitDescription: hasKit ? kitDescription.trim() : '',
      kitCost: kc,
      imageUrl: imageUrl.trim() || undefined,
      kitImages: kitImages.filter(img => img.url.trim()).length > 0 ? kitImages.filter(img => img.url.trim()) : undefined,
      sku: sku.trim() || undefined,
      description: description.trim() || undefined,
      observations: observations.trim() || undefined,
      characteristics,
    });
  };

  const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40';

  return (
    <div className="border border-primary-200 dark:border-primary-800 rounded-2xl p-4 bg-primary-50/40 dark:bg-primary-900/10 space-y-3">
      {/* Linha 1: Nome + preço + margem + SKU */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        <div className="sm:col-span-6">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Nome *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Painel Solar 555W, Inversor..." className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Preço de venda *</label>
          <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={inputCls} />
        </div>
        <div className="sm:col-span-2 flex items-end">
          <div className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs text-slate-500 dark:text-slate-400 text-center">
            <div className="font-bold text-slate-700 dark:text-slate-200">{calcMargin(Number(price), cost)}</div>
            <div>margem</div>
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">SKU</label>
          <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Opcional" className={inputCls} />
        </div>
      </div>

      {/* Imagem do produto */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
          Foto do produto (URL — aparece no orçamento)
        </label>
        <div className="flex gap-2 items-start">
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://... (link da imagem)"
            className={inputCls + ' flex-1'}
          />
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="preview" className="w-12 h-12 object-contain rounded-lg border border-slate-200 dark:border-white/10 flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          )}
        </div>
      </div>

      {/* Composição de custo interno */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Custo interno</span>
          <span className="text-[10px] text-slate-400">— não aparece no orçamento do cliente</span>
        </div>

        {/* Bloco KIT */}
        {!hasKit ? (
          <button
            type="button"
            onClick={() => setHasKit(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-dashed border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 text-xs font-semibold hover:bg-blue-50 dark:hover:bg-blue-900/20 w-full justify-center"
          >
            <Plus className="w-3.5 h-3.5" /> Adicionar Kit de equipamentos
          </button>
        ) : (
          <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-900/15 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-blue-700 dark:text-blue-400">📦 Kit de equipamentos</span>
                <span className="text-[10px] text-blue-500/70 dark:text-blue-400/50">descrição aparece no orçamento do cliente</span>
              </div>
              <button type="button" onClick={() => { setHasKit(false); setKitDescription(''); setKitCost(''); }} className="text-slate-400 hover:text-red-500">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Componentes (descrição para o cliente)</label>
              <textarea
                value={kitDescription}
                onChange={(e) => setKitDescription(e.target.value)}
                rows={4}
                placeholder={'8x Módulo Bifacial 620W RONMA SOLAR\n2x Microinversor 1.875kW HOYMILES\nCabos e conectores fotovoltaicos'}
                className={inputCls + ' resize-none text-xs leading-relaxed'}
              />
              <p className="text-[10px] text-blue-500 dark:text-blue-400/70 mt-0.5">Esta descrição aparece no orçamento. Não coloque valores.</p>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Custo total do kit (interno)</label>
              <input
                value={kitCost}
                onChange={(e) => setKitCost(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                className={inputCls + ' text-xs'}
              />
            </div>

            {/* Fotos dos componentes do kit */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Fotos dos componentes (aparecem no orçamento)
                </label>
                <button
                  type="button"
                  onClick={() => setKitImages(prev => [...prev, { label: '', url: '' }])}
                  className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                >
                  <Plus className="w-3 h-3" /> Adicionar foto
                </button>
              </div>
              {kitImages.length === 0 ? (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 py-1">Nenhuma foto — clique em Adicionar foto</p>
              ) : (
                <div className="space-y-2">
                  {kitImages.map((img, idx) => (
                    <div key={idx} className="flex gap-2 items-start">
                      <div className="flex flex-col gap-1 flex-1">
                        <input
                          value={img.label}
                          onChange={(e) => setKitImages(prev => prev.map((it, i) => i === idx ? { ...it, label: e.target.value } : it))}
                          placeholder="Ex.: Painel Solar"
                          className={inputCls + ' text-xs'}
                        />
                        <input
                          value={img.url}
                          onChange={(e) => setKitImages(prev => prev.map((it, i) => i === idx ? { ...it, url: e.target.value } : it))}
                          placeholder="https://... (URL da imagem)"
                          className={inputCls + ' text-xs'}
                        />
                      </div>
                      {img.url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img.url} alt={img.label} className="w-14 h-14 object-contain rounded-lg border border-slate-200 dark:border-white/10 flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      )}
                      <button
                        type="button"
                        onClick={() => setKitImages(prev => prev.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-red-500 mt-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Serviços e outros custos */}
        <div className="rounded-xl border border-amber-200/60 dark:border-amber-700/30 bg-amber-50/40 dark:bg-amber-900/10 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Serviços e outros custos</span>
            <button
              type="button"
              onClick={addCostItem}
              className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 font-semibold hover:underline"
            >
              <Plus className="w-3 h-3" /> Adicionar
            </button>
          </div>

          {costItems.length === 0 ? (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center py-1">Nenhum serviço adicionado — clique em Adicionar</p>
          ) : (
            <>
              <div className="grid gap-2 pr-6" style={{ gridTemplateColumns: '1fr 120px' }}>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide pl-1">Serviço / item</span>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide pl-1">Custo (R$)</span>
              </div>
              <div className="space-y-1.5">
                {costItems.map((item, i) => (
                  <div key={i} className="grid gap-2 items-center" style={{ gridTemplateColumns: '1fr 120px auto' }}>
                    <input
                      value={item.label}
                      onChange={(e) => updateCostItem(i, 'label', e.target.value)}
                      placeholder={['Instalação', 'Engenharia', 'Frete extra', 'NF / Imposto'][i] ?? 'Ex.: Outros'}
                      className={inputCls + ' text-xs'}
                    />
                    <input
                      value={item.value}
                      onChange={(e) => updateCostItem(i, 'value', e.target.value)}
                      inputMode="decimal"
                      placeholder="0,00"
                      className={inputCls + ' text-xs text-right'}
                    />
                    <button type="button" onClick={() => removeCostItem(i)} className="text-slate-400 hover:text-red-500 shrink-0 w-5">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Totalizador */}
        {cost > 0 && (
          <div className="flex justify-between items-center px-1 text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              Custo total interno
              {hasKit && servicesCost > 0 && <span className="text-slate-400"> (kit + serviços)</span>}
            </span>
            <div className="flex items-center gap-3">
              <span className="font-bold text-slate-700 dark:text-slate-200">{formatBRL(cost)}</span>
              {Number(price) > 0 && cost > 0 && (
                <span className="text-green-600 dark:text-green-400 font-semibold">{calcMargin(Number(price), cost)} margem</span>
              )}
            </div>
          </div>
        )}
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
