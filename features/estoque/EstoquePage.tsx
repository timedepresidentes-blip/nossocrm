'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Package, Plus, TrendingDown, AlertTriangle, CheckCircle2, XCircle, Loader2, ArrowUpCircle, ArrowDownCircle, Sparkles, Upload, FileImage } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface StockItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  min_quantity: number;
}

interface StockMovement {
  id: string;
  type: 'entrada' | 'saida';
  quantity: number;
  notes: string | null;
  created_at: string;
  stock_items: { name: string; unit: string } | null;
}

interface EntradaLine {
  itemId: string;
  qty: string;
}

interface BaixaLine {
  itemId: string;
  qty: string;
}

const inp = 'w-full rounded-lg border border-white/10 bg-[#1e2435] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:ring-1 focus:ring-cyan-500/40';
const sel = 'w-full rounded-lg border border-white/10 bg-[#1e2435] px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-cyan-500/40 [&>option]:bg-[#1e2435] [&>option]:text-slate-100';

function StatusBadge({ item }: { item: StockItem }) {
  if (item.quantity <= 0)
    return <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-400"><XCircle className="h-3 w-3" />Zerado</span>;
  if (item.quantity < item.min_quantity)
    return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-400"><AlertTriangle className="h-3 w-3" />Baixo</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400"><CheckCircle2 className="h-3 w-3" />OK</span>;
}

export function EstoquePage() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'estoque' | 'movimentacoes'>('estoque');

  // Edição direta de item de estoque
  const [editItemOpen, setEditItemOpen] = useState(false);
  const [editItemData, setEditItemData] = useState<StockItem | null>(null);
  const [editItemQty, setEditItemQty] = useState('');
  const [editItemMin, setEditItemMin] = useState('');
  const [savingEditItem, setSavingEditItem] = useState(false);

  // Modal entrada
  const [entradaOpen, setEntradaOpen] = useState(false);
  const [entradaLines, setEntradaLines] = useState<EntradaLine[]>([{ itemId: '', qty: '' }]);
  const [entradaNotes, setEntradaNotes] = useState('');
  const [savingEntrada, setSavingEntrada] = useState(false);

  // Modal novo produto
  const [novoProdutoOpen, setNovoProdutoOpen] = useState(false);
  const [novoProdutoName, setNovoProdutoName] = useState('');
  const [novoProdutoUnit, setNovoProdutoUnit] = useState('un');
  const [novoProdutoMin, setNovoProdutoMin] = useState('1');
  const [novoProdutoQty, setNovoProdutoQty] = useState('0');
  const [savingNovoProduto, setSavingNovoProduto] = useState(false);

  // Estorno / edição de movimentação
  const [estornoConfirmId, setEstornoConfirmId] = useState<string | null>(null);
  const [estornando, setEstornando] = useState(false);
  const [editMovOpen, setEditMovOpen] = useState(false);
  const [editMovData, setEditMovData] = useState<StockMovement | null>(null);
  const [editMovQty, setEditMovQty] = useState('');
  const [editMovNotes, setEditMovNotes] = useState('');
  const [savingEditMov, setSavingEditMov] = useState(false);

  // Modal baixa
  const [baixaOpen, setBaixaOpen] = useState(false);
  const [baixaLines, setBaixaLines] = useState<BaixaLine[]>([]);
  const [baixaNotes, setBaixaNotes] = useState('');
  const [savingBaixa, setSavingBaixa] = useState(false);
  const [arquivoRelatorio, setArquivoRelatorio] = useState<File | null>(null);
  const [extraindo, setExtraindo] = useState(false);
  const [extraidoMsg, setExtraidoMsg] = useState<'ok' | 'erro' | string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [{ data: its }, { data: mvs }] = await Promise.all([
      supabase.from('stock_items').select('*').order('name'),
      supabase.from('stock_movements').select('*, stock_items(name, unit)').order('created_at', { ascending: false }).limit(50),
    ]);
    setItems((its as StockItem[]) ?? []);
    setMovements((mvs as StockMovement[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Abre modal de entrada pré-selecionando um item
  const abrirEntrada = (itemId?: string) => {
    setEntradaLines([{ itemId: itemId ?? '', qty: '' }]);
    setEntradaNotes('');
    setEntradaOpen(true);
  };

  // Abre modal de baixa com todos os itens (qty 0)
  const abrirBaixa = () => {
    setBaixaLines(items.map(i => ({ itemId: i.id, qty: '' })));
    setBaixaNotes('');
    setArquivoRelatorio(null);
    setExtraidoMsg(null);
    setBaixaOpen(true);
  };

  const extrairPorIA = async () => {
    if (!arquivoRelatorio) return;
    setExtraindo(true);
    setExtraidoMsg(null);
    try {
      const fd = new FormData();
      fd.append('arquivo', arquivoRelatorio);
      fd.append('itens', JSON.stringify(items.map(i => ({ id: i.id, name: i.name, unit: i.unit }))));

      const resp = await fetch('/api/estoque/extrair', { method: 'POST', body: fd });
      const data = await resp.json();
      if (!resp.ok || !data.extraidos) throw new Error(data.error ?? 'Erro');

      const encontrados = data.extraidos.length as number;
      setBaixaLines(prev => prev.map(l => {
        const e = data.extraidos.find((x: { itemId: string; qty: number }) => x.itemId === l.itemId);
        return e ? { ...l, qty: String(e.qty) } : l;
      }));
      setExtraidoMsg(`${encontrados} item(s) identificado(s)`);
    } catch (err) {
      setExtraidoMsg('erro: ' + (err instanceof Error ? err.message : 'falha na extração'));
    } finally {
      setExtraindo(false);
    }
  };

  const salvarEntrada = async () => {
    if (!supabase) return;
    const linhas = entradaLines.filter(l => l.itemId && parseFloat(l.qty) > 0);
    if (!linhas.length) return;
    setSavingEntrada(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from('profiles').select('id, organization_id').eq('id', user?.id ?? '').maybeSingle();
      const orgId = profile?.organization_id;
      const userId = profile?.id;

      for (const l of linhas) {
        const qty = parseFloat(l.qty);
        const itemAtual = items.find(i => i.id === l.itemId);
        await supabase.from('stock_movements').insert({
          organization_id: orgId,
          stock_item_id: l.itemId,
          type: 'entrada',
          quantity: qty,
          notes: entradaNotes || null,
          created_by: userId,
        });
        await supabase.from('stock_items').update({
          quantity: (itemAtual?.quantity ?? 0) + qty,
          updated_at: new Date().toISOString(),
        }).eq('id', l.itemId);
      }
      setEntradaOpen(false);
      await load();
    } catch (e) {
      console.error('Erro ao salvar entrada:', e);
    } finally {
      setSavingEntrada(false);
    }
  };

  const salvarBaixa = async () => {
    if (!supabase) return;
    const linhas = baixaLines.filter(l => parseFloat(l.qty) > 0);
    if (!linhas.length) return;
    setSavingBaixa(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from('profiles').select('id, organization_id').eq('id', user?.id ?? '').maybeSingle();
      const orgId = profile?.organization_id;
      const userId = profile?.id;

      for (const l of linhas) {
        const qty = parseFloat(l.qty);
        const item = items.find(i => i.id === l.itemId);
        if (!item) continue;
        await supabase.from('stock_movements').insert({
          organization_id: orgId,
          stock_item_id: l.itemId,
          type: 'saida',
          quantity: qty,
          notes: baixaNotes || null,
          created_by: userId,
        });
        await supabase.from('stock_items').update({
          quantity: Math.max(0, item.quantity - qty),
          updated_at: new Date().toISOString(),
        }).eq('id', l.itemId);
      }
      setBaixaOpen(false);
      await load();
    } catch (e) {
      console.error('Erro ao salvar baixa:', e);
    } finally {
      setSavingBaixa(false);
    }
  };

  const confirmarEstorno = async (mv: StockMovement) => {
    if (!supabase) return;
    setEstornando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from('profiles').select('id, organization_id').eq('id', user?.id ?? '').maybeSingle();
      const orgId = profile?.organization_id;
      const userId = profile?.id;
      // Tipo inverso ao original
      const tipoInverso = mv.type === 'entrada' ? 'saida' : 'entrada';
      const itemAtual = items.find(i => i.id === (mv as any).stock_item_id);
      await supabase.from('stock_movements').insert({
        organization_id: orgId,
        stock_item_id: (mv as any).stock_item_id,
        type: tipoInverso,
        quantity: mv.quantity,
        notes: `Estorno de ${mv.type} — ${mv.stock_items?.name ?? ''}${mv.notes ? ` (${mv.notes})` : ''}`,
        created_by: userId,
      });
      const delta = tipoInverso === 'entrada' ? mv.quantity : -mv.quantity;
      if (itemAtual) {
        await supabase.from('stock_items').update({
          quantity: Math.max(0, itemAtual.quantity + delta),
          updated_at: new Date().toISOString(),
        }).eq('id', (mv as any).stock_item_id);
      }
      setEstornoConfirmId(null);
      await load();
    } catch (e) {
      console.error('Erro ao estornar:', e);
    } finally {
      setEstornando(false);
    }
  };

  const abrirEditMov = (mv: StockMovement) => {
    setEditMovData(mv);
    setEditMovQty(String(mv.quantity));
    setEditMovNotes(mv.notes ?? '');
    setEditMovOpen(true);
  };

  const salvarEditMov = async () => {
    if (!supabase || !editMovData) return;
    const novaQty = parseFloat(editMovQty);
    if (isNaN(novaQty) || novaQty <= 0) return;
    setSavingEditMov(true);
    try {
      const diff = novaQty - editMovData.quantity; // positivo = aumentou, negativo = reduziu
      const delta = editMovData.type === 'entrada' ? diff : -diff;
      const itemAtual = items.find(i => i.id === (editMovData as any).stock_item_id);
      await supabase.from('stock_movements').update({
        quantity: novaQty,
        notes: editMovNotes || null,
        updated_at: new Date().toISOString(),
      } as any).eq('id', editMovData.id);
      if (itemAtual && diff !== 0) {
        await supabase.from('stock_items').update({
          quantity: Math.max(0, itemAtual.quantity + delta),
          updated_at: new Date().toISOString(),
        }).eq('id', (editMovData as any).stock_item_id);
      }
      setEditMovOpen(false);
      setEditMovData(null);
      await load();
    } catch (e) {
      console.error('Erro ao editar movimentação:', e);
    } finally {
      setSavingEditMov(false);
    }
  };

  const abrirEditItem = (item: StockItem) => {
    setEditItemData(item);
    setEditItemQty(String(item.quantity));
    setEditItemMin(String(item.min_quantity));
    setEditItemOpen(true);
  };

  const salvarEditItem = async () => {
    if (!supabase || !editItemData) return;
    setSavingEditItem(true);
    try {
      await supabase.from('stock_items').update({
        quantity: parseFloat(editItemQty) || 0,
        min_quantity: parseFloat(editItemMin) || 1,
        updated_at: new Date().toISOString(),
      }).eq('id', editItemData.id);
      setEditItemOpen(false);
      setEditItemData(null);
      await load();
    } catch (e) {
      console.error('Erro ao editar item:', e);
    } finally {
      setSavingEditItem(false);
    }
  };

  const abrirNovoProduto = () => {
    setNovoProdutoName('');
    setNovoProdutoUnit('un');
    setNovoProdutoMin('1');
    setNovoProdutoQty('0');
    setNovoProdutoOpen(true);
  };

  const salvarNovoProduto = async () => {
    if (!supabase || !novoProdutoName.trim()) return;
    setSavingNovoProduto(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user?.id ?? '').maybeSingle();
      await supabase.from('stock_items').insert({
        organization_id: profile?.organization_id,
        name: novoProdutoName.trim(),
        unit: novoProdutoUnit.trim() || 'un',
        quantity: parseFloat(novoProdutoQty) || 0,
        min_quantity: parseFloat(novoProdutoMin) || 1,
      });
      setNovoProdutoOpen(false);
      await load();
    } catch (e) {
      console.error('Erro ao criar produto:', e);
    } finally {
      setSavingNovoProduto(false);
    }
  };

  const fmt = (n: number, unit: string) => `${n % 1 === 0 ? n : n.toFixed(1)} ${unit}`;
  const dtFmt = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-cyan-500/15 flex items-center justify-center">
            <Package className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Controle de Estoque</h1>
            <p className="text-xs text-slate-500">{items.length} itens cadastrados</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={abrirNovoProduto} className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-2 text-sm font-semibold text-cyan-300 hover:bg-cyan-500/25">
            <Plus className="h-4 w-4" /> Novo Produto
          </button>
          <button onClick={() => abrirBaixa()} className="flex items-center gap-1.5 rounded-lg border border-orange-500/40 bg-orange-500/15 px-3 py-2 text-sm font-semibold text-orange-300 hover:bg-orange-500/25">
            <TrendingDown className="h-4 w-4" /> Dar Baixa
          </button>
          <button onClick={() => abrirEntrada()} className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/25">
            <Plus className="h-4 w-4" /> Nova Entrada
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-white/10 bg-white/3 p-1 w-fit">
        {(['estoque', 'movimentacoes'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${tab === t ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
            {t === 'estoque' ? 'Estoque Atual' : 'Movimentações'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : tab === 'estoque' ? (
        /* Tabela de estoque */
        <div className="rounded-xl border border-white/10 bg-white/3 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/3">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Item</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Unidade</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Quantidade</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Mínimo</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-white/3 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-200">{item.name}</td>
                  <td className="px-4 py-3 text-center text-slate-400">{item.unit}</td>
                  <td className={`px-4 py-3 text-center font-bold ${item.quantity <= 0 ? 'text-red-400' : item.quantity < item.min_quantity ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-500">{item.min_quantity}</td>
                  <td className="px-4 py-3 text-center"><StatusBadge item={item} /></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-1.5 justify-end">
                      <button onClick={() => abrirEditItem(item)}
                        className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-400 hover:bg-cyan-500/20">
                        Editar
                      </button>
                      <button onClick={() => abrirEntrada(item.id)}
                        className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/20">
                        + Entrada
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Lista de movimentações */
        <div className="rounded-xl border border-white/10 bg-white/3 overflow-hidden">
          {movements.length === 0 ? (
            <p className="py-12 text-center text-slate-500">Nenhuma movimentação ainda.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {movements.map(mv => (
                <div key={mv.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/3 group">
                  {mv.type === 'entrada'
                    ? <ArrowUpCircle className="h-5 w-5 text-emerald-400 shrink-0" />
                    : <ArrowDownCircle className="h-5 w-5 text-orange-400 shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200">{mv.stock_items?.name ?? '—'}</p>
                    {mv.notes && <p className="text-xs text-slate-500 truncate">{mv.notes}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${mv.type === 'entrada' ? 'text-emerald-400' : 'text-orange-400'}`}>
                      {mv.type === 'entrada' ? '+' : '-'}{mv.quantity} {mv.stock_items?.unit}
                    </p>
                    <p className="text-[11px] text-slate-500">{dtFmt(mv.created_at)}</p>
                  </div>
                  {/* Ações */}
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => abrirEditMov(mv)}
                      className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold text-cyan-400 hover:bg-cyan-500/20"
                      title="Editar quantidade/observação"
                    >Editar</button>
                    {estornoConfirmId === mv.id ? (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-amber-400">Confirmar?</span>
                        <button
                          onClick={() => confirmarEstorno(mv)}
                          disabled={estornando}
                          className="rounded-md border border-red-500/40 bg-red-500/15 px-2 py-1 text-[10px] font-bold text-red-400 hover:bg-red-500/25 disabled:opacity-50"
                        >{estornando ? '...' : 'Sim'}</button>
                        <button
                          onClick={() => setEstornoConfirmId(null)}
                          className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-400"
                        >Não</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEstornoConfirmId(mv.id)}
                        className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-400 hover:bg-amber-500/20"
                        title="Estornar este movimento"
                      >Estornar</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal Editar Item de Estoque */}
      {editItemOpen && editItemData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#1a1f2e] shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <h2 className="text-sm font-semibold text-white">Editar Item</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">{editItemData.name}</p>
              </div>
              <button onClick={() => setEditItemOpen(false)} className="text-slate-500 hover:text-white text-xl leading-none">&times;</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-500">Quantidade atual ({editItemData.unit})</label>
                <input type="number" min="0" step="any" className={inp} value={editItemQty}
                  onChange={e => setEditItemQty(e.target.value)} autoFocus />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-500">Quantidade mínima (alerta)</label>
                <input type="number" min="0" step="any" className={inp} value={editItemMin}
                  onChange={e => setEditItemMin(e.target.value)} />
              </div>
              <p className="text-[10px] text-amber-400/80">Edição direta — use para corrigir erros de digitação.</p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/10">
              <button onClick={() => setEditItemOpen(false)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/10">
                Cancelar
              </button>
              <button onClick={salvarEditItem} disabled={savingEditItem}
                className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50">
                {savingEditItem ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Movimentação */}
      {editMovOpen && editMovData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#1a1f2e] shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <h2 className="text-sm font-semibold text-white">Editar Movimentação</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">{editMovData.stock_items?.name} — {editMovData.type === 'entrada' ? 'Entrada' : 'Saída'}</p>
              </div>
              <button onClick={() => setEditMovOpen(false)} className="text-slate-500 hover:text-white text-xl leading-none">&times;</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-500">Quantidade ({editMovData.stock_items?.unit})</label>
                <input
                  type="number" min="0.01" step="any"
                  className={inp}
                  value={editMovQty}
                  onChange={e => setEditMovQty(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-500">Observação</label>
                <input className={inp} placeholder="Opcional" value={editMovNotes} onChange={e => setEditMovNotes(e.target.value)} />
              </div>
              <p className="text-[10px] text-amber-400/80">O saldo do item será ajustado automaticamente pela diferença.</p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/10">
              <button onClick={() => setEditMovOpen(false)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/10">
                Cancelar
              </button>
              <button onClick={salvarEditMov} disabled={savingEditMov}
                className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50">
                {savingEditMov ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Novo Produto */}
      {novoProdutoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#1a1f2e] shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <h2 className="text-sm font-semibold text-white">Novo Produto</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Cadastre um item que não está na lista</p>
              </div>
              <button onClick={() => setNovoProdutoOpen(false)} className="text-slate-500 hover:text-white text-xl leading-none">&times;</button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-500">Nome do produto *</label>
                <input
                  className={inp}
                  placeholder="Ex: Módulo solar 550W, Inversor 5kW..."
                  value={novoProdutoName}
                  onChange={e => setNovoProdutoName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1 flex flex-col gap-1">
                  <label className="text-[10px] text-slate-500">Unidade</label>
                  <select className={sel} value={novoProdutoUnit} onChange={e => setNovoProdutoUnit(e.target.value)}>
                    <option value="un">un (unidade)</option>
                    <option value="m">m (metro)</option>
                    <option value="m²">m² (metro quadrado)</option>
                    <option value="kg">kg (quilograma)</option>
                    <option value="cx">cx (caixa)</option>
                    <option value="rolo">rolo</option>
                    <option value="par">par</option>
                    <option value="l">l (litro)</option>
                  </select>
                </div>
                <div className="w-28 flex flex-col gap-1">
                  <label className="text-[10px] text-slate-500">Qtd. mínima</label>
                  <input type="number" min="0" step="any" className={inp} value={novoProdutoMin} onChange={e => setNovoProdutoMin(e.target.value)} />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-500">Quantidade inicial em estoque</label>
                <input type="number" min="0" step="any" className={inp} value={novoProdutoQty} onChange={e => setNovoProdutoQty(e.target.value)} />
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/10">
              <button onClick={() => setNovoProdutoOpen(false)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/10">
                Cancelar
              </button>
              <button onClick={salvarNovoProduto} disabled={savingNovoProduto || !novoProdutoName.trim()}
                className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50">
                {savingNovoProduto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Cadastrar Produto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova Entrada */}
      {entradaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl border border-white/10 bg-[#1a1f2e] shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <h2 className="text-sm font-semibold text-white">Nova Entrada de Estoque</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Registre a compra de materiais</p>
              </div>
              <button onClick={() => setEntradaOpen(false)} className="text-slate-500 hover:text-white text-xl leading-none">&times;</button>
            </div>

            <div className="overflow-y-auto px-5 py-4 space-y-3">
              {entradaLines.map((line, i) => (
                <div key={i} className="flex gap-2 items-end">
                  <div className="flex-1 flex flex-col gap-1">
                    {i === 0 && <label className="text-[10px] text-slate-500">Item</label>}
                    <select
                      className={sel}
                      value={line.itemId}
                      onChange={e => setEntradaLines(prev => prev.map((l, j) => j === i ? { ...l, itemId: e.target.value } : l))}
                    >
                      <option value="">Selecione o item...</option>
                      {items.map(it => <option key={it.id} value={it.id}>{it.name} ({it.unit})</option>)}
                    </select>
                  </div>
                  <div className="w-28 flex flex-col gap-1">
                    {i === 0 && <label className="text-[10px] text-slate-500">Quantidade</label>}
                    <input type="number" min="0" step="any" placeholder="0"
                      className={inp}
                      value={line.qty}
                      onChange={e => setEntradaLines(prev => prev.map((l, j) => j === i ? { ...l, qty: e.target.value } : l))}
                    />
                  </div>
                  {entradaLines.length > 1 && (
                    <button onClick={() => setEntradaLines(prev => prev.filter((_, j) => j !== i))}
                      className="mb-0.5 text-slate-500 hover:text-red-400 text-lg leading-none">&times;</button>
                  )}
                </div>
              ))}

              <button onClick={() => setEntradaLines(prev => [...prev, { itemId: '', qty: '' }])}
                className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300">
                <Plus className="h-3 w-3" /> Adicionar mais item
              </button>

              <div className="flex flex-col gap-1 pt-1">
                <label className="text-[10px] text-slate-500">Observação (ex: NF 12345, Fornecedor)</label>
                <input className={inp} placeholder="Opcional" value={entradaNotes} onChange={e => setEntradaNotes(e.target.value)} />
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/10">
              <button onClick={() => setEntradaOpen(false)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/10">
                Cancelar
              </button>
              <button onClick={salvarEntrada} disabled={savingEntrada}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50">
                {savingEntrada ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Confirmar Entrada
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Dar Baixa */}
      {baixaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl border border-white/10 bg-[#1a1f2e] shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <h2 className="text-sm font-semibold text-white">Dar Baixa no Estoque</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Informe os materiais usados na instalação</p>
              </div>
              <button onClick={() => setBaixaOpen(false)} className="text-slate-500 hover:text-white text-xl leading-none">&times;</button>
            </div>

            <div className="overflow-y-auto px-5 py-4 space-y-3">
              {/* Observação */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-500">Observação / O.S. (ex: nome do cliente, número da OS)</label>
                <input className={inp} placeholder="Ex: João da Silva — OS-20260817-ABC123" value={baixaNotes} onChange={e => setBaixaNotes(e.target.value)} />
              </div>

              {/* Extração por IA */}
              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                  <span className="text-[11px] font-semibold text-cyan-300">Extração por IA</span>
                  <span className="text-[10px] text-slate-500 ml-1">Foto ou PDF do formulário do instalador</span>
                </div>

                {/* Área de upload */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={e => { setArquivoRelatorio(e.target.files?.[0] ?? null); setExtraidoMsg(null); }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 transition-colors
                    ${arquivoRelatorio
                      ? 'border-cyan-500/50 bg-cyan-500/10'
                      : 'border-white/10 bg-white/3 hover:border-cyan-500/30 hover:bg-cyan-500/5'
                    }`}
                >
                  {arquivoRelatorio ? (
                    <>
                      <FileImage className="h-6 w-6 text-cyan-400" />
                      <span className="text-[11px] text-cyan-300 font-medium truncate max-w-full px-2">{arquivoRelatorio.name}</span>
                      <span className="text-[10px] text-slate-500">Clique para trocar o arquivo</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-6 w-6 text-slate-500" />
                      <span className="text-[11px] text-slate-400">Clique para selecionar foto ou PDF</span>
                      <span className="text-[10px] text-slate-600">JPG, PNG, WEBP ou PDF</span>
                    </>
                  )}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={extrairPorIA}
                    disabled={extraindo || !arquivoRelatorio}
                    className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-40"
                  >
                    {extraindo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    {extraindo ? 'Lendo formulário...' : 'Extrair e preencher'}
                  </button>
                  {extraidoMsg && !extraidoMsg.startsWith('erro') && (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400"><CheckCircle2 className="h-3 w-3" />{extraidoMsg}</span>
                  )}
                  {extraidoMsg?.startsWith('erro') && (
                    <span className="flex items-center gap-1 text-[11px] text-red-400"><XCircle className="h-3 w-3" />{extraidoMsg}</span>
                  )}
                </div>
              </div>

              <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold pb-1">Materiais utilizados</p>

              {baixaLines.map((line, i) => {
                const item = items.find(it => it.id === line.itemId);
                if (!item) return null;
                const qty = parseFloat(line.qty) || 0;
                const excede = qty > item.quantity;
                return (
                  <div key={line.itemId} className="flex items-center gap-3 py-1.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-300 truncate">{item.name}</p>
                      <p className="text-[11px] text-slate-500">Disponível: {item.quantity} {item.unit}</p>
                    </div>
                    <div className="w-28 shrink-0">
                      <input type="number" min="0" step="any" placeholder="0"
                        className={`${inp} ${excede ? 'ring-1 ring-red-500/50 border-red-500/30' : ''}`}
                        value={line.qty}
                        onChange={e => setBaixaLines(prev => prev.map((l, j) => j === i ? { ...l, qty: e.target.value } : l))}
                      />
                    </div>
                    {excede && <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/10">
              <button onClick={() => setBaixaOpen(false)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/10">
                Cancelar
              </button>
              <button onClick={salvarBaixa} disabled={savingBaixa}
                className="flex items-center gap-1.5 rounded-lg border border-orange-500/40 bg-orange-500/15 px-4 py-2 text-sm font-semibold text-orange-300 hover:bg-orange-500/25 disabled:opacity-50">
                {savingBaixa ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingDown className="h-4 w-4" />}
                Confirmar Baixa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
