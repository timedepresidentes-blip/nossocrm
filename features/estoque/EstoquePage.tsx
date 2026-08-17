'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Package, Plus, TrendingDown, AlertTriangle, CheckCircle2, XCircle, Loader2, ArrowUpCircle, ArrowDownCircle, Sparkles } from 'lucide-react';
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

  // Modal entrada
  const [entradaOpen, setEntradaOpen] = useState(false);
  const [entradaLines, setEntradaLines] = useState<EntradaLine[]>([{ itemId: '', qty: '' }]);
  const [entradaNotes, setEntradaNotes] = useState('');
  const [savingEntrada, setSavingEntrada] = useState(false);

  // Modal baixa
  const [baixaOpen, setBaixaOpen] = useState(false);
  const [baixaLines, setBaixaLines] = useState<BaixaLine[]>([]);
  const [baixaNotes, setBaixaNotes] = useState('');
  const [savingBaixa, setSavingBaixa] = useState(false);
  const [textoRelatorio, setTextoRelatorio] = useState('');
  const [extraindo, setExtraindo] = useState(false);
  const [extraidoMsg, setExtraidoMsg] = useState<'ok' | 'erro' | null>(null);

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
    setTextoRelatorio('');
    setExtraidoMsg(null);
    setBaixaOpen(true);
  };

  const extrairPorIA = async () => {
    if (!textoRelatorio.trim()) return;
    setExtraindo(true);
    setExtraidoMsg(null);
    try {
      const resp = await fetch('/api/estoque/extrair', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          texto: textoRelatorio,
          itens: items.map(i => ({ id: i.id, name: i.name, unit: i.unit })),
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.extraidos) throw new Error(data.error ?? 'Erro');

      // Preenche as linhas de baixa com os valores extraídos
      setBaixaLines(prev => prev.map(l => {
        const encontrado = data.extraidos.find((e: { itemId: string; qty: number }) => e.itemId === l.itemId);
        return encontrado ? { ...l, qty: String(encontrado.qty) } : l;
      }));
      setExtraidoMsg('ok');
    } catch {
      setExtraidoMsg('erro');
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
                    <button onClick={() => abrirEntrada(item.id)}
                      className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/20">
                      + Entrada
                    </button>
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
                <div key={mv.id} className="flex items-center gap-4 px-4 py-3 hover:bg-white/3">
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
                </div>
              ))}
            </div>
          )}
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
                  <span className="text-[10px] text-slate-500 ml-1">Cole o relatório do instalador abaixo</span>
                </div>
                <textarea
                  className="w-full rounded-lg border border-white/10 bg-[#1e2435] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:ring-1 focus:ring-cyan-500/40 resize-none"
                  rows={4}
                  placeholder={"Ex:\nCabo CA 10mm: 35m\nCabo Terra 6mm: 20m\nDisjuntor 32A: 1 un\nCaixa Disjuntor: 1\nPlaquinha: 2"}
                  value={textoRelatorio}
                  onChange={e => { setTextoRelatorio(e.target.value); setExtraidoMsg(null); }}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={extrairPorIA}
                    disabled={extraindo || !textoRelatorio.trim()}
                    className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-40"
                  >
                    {extraindo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    {extraindo ? 'Extraindo...' : 'Extrair e preencher'}
                  </button>
                  {extraidoMsg === 'ok' && <span className="flex items-center gap-1 text-[11px] text-emerald-400"><CheckCircle2 className="h-3 w-3" />Campos preenchidos!</span>}
                  {extraidoMsg === 'erro' && <span className="flex items-center gap-1 text-[11px] text-red-400"><XCircle className="h-3 w-3" />Erro na extração</span>}
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
