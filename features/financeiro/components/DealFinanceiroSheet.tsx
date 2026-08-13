'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Deal } from '@/types';
import { useUpdateDeal } from '@/lib/query/hooks/useDealsQuery';
import { useToast } from '@/context/ToastContext';
import { cn } from '@/lib/utils';
import { X, Plus, Trash2, Save, TrendingUp, TrendingDown, DollarSign, Percent, CheckCircle2, XCircle, AlertTriangle, Wallet, Pencil } from 'lucide-react';
import { CustosPagos } from '@/lib/supabase/dealCosts';

interface Props {
  deal: Deal | null;
  isOpen: boolean;
  onClose: () => void;
}

type CustoExtra = { descricao: string; valor: number };

function fmtBRL(v: number | undefined | null) {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtKwp(v: number | undefined | null) {
  if (v == null) return '—';
  return `${v.toFixed(2)} kWp`;
}

function parseBRL(s: string): number {
  if (!s.trim()) return 0;
  // Remove R$, espaços; remove pontos de milhar; converte vírgula decimal
  const clean = s.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

interface FieldRowProps {
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
  onLiveChange?: (v: number) => void;
  highlight?: 'green' | 'red';
  pago?: boolean;
  onTogglePago?: () => void;
}

function FieldRow({ label, value, onChange, onLiveChange, highlight, pago, onTogglePago }: FieldRowProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback(() => {
    setText(value != null && value > 0 ? value.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '');
    setEditing(true);
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.select();
    }
  }, [editing]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    if (onLiveChange) onLiveChange(parseBRL(e.target.value));
  };

  const commit = () => {
    const v = parseBRL(text);
    onChange(v);
    setEditing(false);
  };

  const temValor = value != null && value > 0;

  return (
    <div
      className={cn(
        'flex items-center gap-2 py-2 px-3 rounded-lg transition-colors group/row',
        highlight === 'green' && 'bg-emerald-500/10 border border-emerald-500/20',
        highlight === 'red' && 'bg-rose-500/10 border border-rose-500/20',
        !highlight && temValor && !pago && 'bg-rose-500/8 border border-rose-500/15',
        !highlight && (!temValor || pago) && 'hover:bg-white/5',
        !editing && 'cursor-pointer',
      )}
      onClick={() => { if (!editing) startEdit(); }}
    >
      {onTogglePago && temValor ? (
        <button
          onClick={e => { e.stopPropagation(); onTogglePago(); }}
          className="shrink-0 transition-colors"
          title={pago ? 'Marcar como pendente' : 'Marcar como pago'}
        >
          {pago
            ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            : <XCircle className="h-4 w-4 text-rose-500 hover:text-rose-400" />}
        </button>
      ) : onTogglePago ? (
        <div className="w-4 shrink-0" />
      ) : null}

      <span className={cn('text-sm flex-1', pago && temValor ? 'text-slate-500 line-through' : 'text-slate-300')}>{label}</span>

      {editing ? (
        <input
          ref={inputRef}
          autoFocus
          className="w-36 text-right bg-dark-card border border-primary-500 rounded px-2 py-0.5 text-sm text-white focus:outline-none"
          value={text}
          onChange={handleChange}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { setEditing(false); if (onLiveChange) onLiveChange(value ?? 0); }
          }}
          onClick={e => e.stopPropagation()}
          placeholder="0,00"
        />
      ) : (
        <div className="flex items-center gap-1">
          <span className={cn(
            'text-sm font-mono font-medium',
            highlight === 'green' ? 'text-emerald-400' : highlight === 'red' ? 'text-rose-400' : temValor ? 'text-white' : 'text-slate-500',
            pago && temValor && 'line-through',
          )}>
            {temValor ? fmtBRL(value) : <span className="text-xs">—</span>}
          </span>
          <Pencil className="h-3 w-3 text-slate-600 opacity-0 group-hover/row:opacity-100 transition-opacity" />
        </div>
      )}
    </div>
  );
}

export function DealFinanceiroSheet({ deal, isOpen, onClose }: Props) {
  const { addToast } = useToast();
  const updateDeal = useUpdateDeal();

  const [custoNf, setCustoNf] = useState<number | undefined>(undefined);
  const [custoNfTipo, setCustoNfTipo] = useState<string>('fixo');
  const [custoEngenharia, setCustoEngenharia] = useState<number | undefined>(undefined);
  const [custoCorrugado, setCustoCorrugado] = useState<number | undefined>(undefined);
  const [custoEletroduto, setCustoEletroduto] = useState<number | undefined>(undefined);
  const [custoFornecedor, setCustoFornecedor] = useState<number | undefined>(undefined);
  const [voucherBancoPct, setVoucherBancoPct] = useState<number | undefined>(undefined);
  const [custoArt, setCustoArt] = useState<number | undefined>(undefined);
  const [comissaoValor, setComissaoValor] = useState<number | undefined>(undefined);
  const [custosExtras, setCustosExtras] = useState<CustoExtra[]>([]);
  const [custosPagos, setCustosPagos] = useState<CustosPagos>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!deal) return;
    setCustoNf(deal.custoNf);
    setCustoNfTipo(deal.custoNfTipo || 'fixo');
    setCustoEngenharia(deal.custoEngenharia);
    setCustoCorrugado(deal.custoCorrugado);
    setCustoEletroduto(deal.custoEletroduto);
    setCustoFornecedor(deal.custoFornecedor);
    setVoucherBancoPct(deal.voucherBancoPct);
    setCustoArt(deal.custoArt);
    setComissaoValor(deal.comissaoValor);
    setCustosExtras(deal.custosExtras || []);
    setCustosPagos(deal.custosPagos || {});
  }, [deal]);

  if (!isOpen || !deal) return null;

  const receita = deal.value || 0;
  const kwp = deal.fichaCliente?.potenciaKwp ?? null;
  const nomeCliente = deal.fichaCliente?.nomeCompleto || deal.title;

  const somaExtras = custosExtras.reduce((s, c) => s + (c.valor || 0), 0);
  const custoFornecedorEfetivo = (custoFornecedor || 0) * (1 - (voucherBancoPct || 0) / 100);
  const custoTotalCalc =
    (custoNf || 0) +
    (custoEngenharia || 0) +
    (custoCorrugado || 0) +
    (custoEletroduto || 0) +
    custoFornecedorEfetivo +
    (custoArt || 0) +
    (comissaoValor || 0) +
    somaExtras;

  const lucroBruto = receita - custoTotalCalc;
  const margemPct = receita > 0 ? (lucroBruto / receita) * 100 : 0;

  // Caixa em tempo real: quanto já saiu vs quanto ainda vai sair
  const totalPago =
    (custosPagos.nf         ? (custoNf || 0) : 0) +
    (custosPagos.fornecedor ? custoFornecedorEfetivo : 0) +
    (custosPagos.engenharia ? (custoEngenharia || 0) : 0) +
    (custosPagos.art        ? (custoArt || 0) : 0) +
    (custosPagos.corrugado  ? (custoCorrugado || 0) : 0) +
    (custosPagos.eletroduto ? (custoEletroduto || 0) : 0) +
    (custosPagos.comissao   ? (comissaoValor || 0) : 0) +
    custosExtras.reduce((s, e, i) => s + ((custosPagos.extras || [])[i] ? (e.valor || 0) : 0), 0);
  const totalPendente = custoTotalCalc - totalPago;
  const caixaAtual = receita - totalPago;

  // Checklist de pagamentos
  const camposComValor = [
    { key: 'nf' as const,         val: custoNf },
    { key: 'fornecedor' as const,  val: custoFornecedor },
    { key: 'engenharia' as const,  val: custoEngenharia },
    { key: 'art' as const,         val: custoArt },
    { key: 'corrugado' as const,   val: custoCorrugado },
    { key: 'eletroduto' as const,  val: custoEletroduto },
    { key: 'comissao' as const,    val: comissaoValor },
  ].filter(c => (c.val || 0) > 0);
  const extrasComValor = custosExtras.filter(e => e.valor > 0);
  const totalItens = camposComValor.length + extrasComValor.length;
  const pagosCount = camposComValor.filter(c => custosPagos[c.key]).length
    + extrasComValor.filter((_, i) => (custosPagos.extras || [])[i]).length;
  const pendentes = totalItens - pagosCount;
  const tudoPago = totalItens > 0 && pendentes === 0;

  const savePagos = async (next: CustosPagos) => {
    try {
      await updateDeal.mutateAsync({ id: deal!.id, updates: { custosPagos: next } });
    } catch { /* silencioso, estado local já atualizado */ }
  };

  const togglePago = (key: keyof Omit<CustosPagos, 'extras'>) =>
    setCustosPagos(prev => {
      const next = { ...prev, [key]: !prev[key] };
      void savePagos(next);
      return next;
    });
  const toggleExtraPago = (i: number) =>
    setCustosPagos(prev => {
      const extras = [...(prev.extras || [])];
      extras[i] = !extras[i];
      const next = { ...prev, extras };
      void savePagos(next);
      return next;
    });

  const addExtra = () => setCustosExtras(prev => [...prev, { descricao: '', valor: 0 }]);
  const removeExtra = (i: number) => setCustosExtras(prev => prev.filter((_, idx) => idx !== i));
  const updateExtra = (i: number, field: keyof CustoExtra, val: string | number) =>
    setCustosExtras(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: val } : c));

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateDeal.mutateAsync({
        id: deal.id,
        updates: {
          custoNf,
          custoNfTipo,
          custoEngenharia,
          custoCorrugado,
          custoEletroduto,
          custoFornecedor,
          voucherBancoPct,
          custoArt,
          comissaoValor,
          custosExtras,
          custoTotal: custoTotalCalc,
          lucroBruto,
          margemPct,
          custosPagos,
        },
      });
      addToast('Financeiro salvo com sucesso.', 'success');
    } catch {
      addToast('Erro ao salvar. Tente novamente.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Overlay */}
      <div className="flex-1 bg-black/50" onClick={onClose} />

      {/* Sheet */}
      <div className="w-full max-w-lg bg-dark-card border-l border-white/10 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-white/10 shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">Planilha Financeira</p>
            <h2 className="font-semibold text-white truncate">{nomeCliente}</h2>
            <div className="flex items-center gap-3 mt-1">
              {kwp && <span className="text-xs text-primary-400 font-medium">{fmtKwp(kwp)}</span>}
              {deal.closedAt && (
                <span className="text-xs text-slate-400">
                  Fechado em {new Date(deal.closedAt).toLocaleDateString('pt-BR')}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors ml-2 shrink-0">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-2 p-4 border-b border-white/10 shrink-0">
          <div className="bg-white/5 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="h-3.5 w-3.5 text-primary-400" />
              <span className="text-xs text-slate-400">Receita</span>
            </div>
            <p className="text-base font-semibold text-white">{fmtBRL(receita)}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="h-3.5 w-3.5 text-rose-400" />
              <span className="text-xs text-slate-400">Custo Total</span>
            </div>
            <p className="text-base font-semibold text-rose-300">{fmtBRL(custoTotalCalc)}</p>
          </div>
          <div className={cn('rounded-xl p-3', lucroBruto >= 0 ? 'bg-emerald-500/10' : 'bg-rose-500/10')}>
            <div className="flex items-center gap-1.5 mb-1">
              {lucroBruto >= 0
                ? <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                : <TrendingDown className="h-3.5 w-3.5 text-rose-400" />}
              <span className="text-xs text-slate-400">Lucro Bruto</span>
            </div>
            <p className={cn('text-base font-semibold', lucroBruto >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
              {fmtBRL(lucroBruto)}
            </p>
          </div>
          <div className={cn('rounded-xl p-3', margemPct >= 0 ? 'bg-emerald-500/10' : 'bg-rose-500/10')}>
            <div className="flex items-center gap-1.5 mb-1">
              <Percent className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs text-slate-400">Margem</span>
            </div>
            <p className={cn('text-base font-semibold', margemPct >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
              {margemPct.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Custos */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">

          {/* Caixa em tempo real */}
          <div className={cn(
            'rounded-xl border p-3 mb-3 space-y-2',
            totalPendente > 0 ? 'bg-rose-500/10 border-rose-500/30' : 'bg-emerald-500/10 border-emerald-500/30'
          )}>
            <div className="flex items-center gap-1.5 mb-1">
              <Wallet className={cn('h-4 w-4', totalPendente > 0 ? 'text-rose-400' : 'text-emerald-400')} />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">Caixa Atual</span>
              <span className="ml-auto text-xs text-slate-500">{pagosCount}/{totalItens} pagos</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Receita recebida</span>
              <span className="text-white font-mono">{fmtBRL(receita)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">(-) Já pago</span>
              <span className="text-emerald-400 font-mono">- {fmtBRL(totalPago)}</span>
            </div>
            <div className="h-px bg-white/10" />
            <div className="flex justify-between text-sm font-semibold">
              <span className="text-white">Disponível agora</span>
              <span className={cn('font-mono', caixaAtual >= 0 ? 'text-white' : 'text-rose-400')}>{fmtBRL(caixaAtual)}</span>
            </div>
            {totalPendente > 0 && (
              <div className="flex items-center justify-between pt-1 border-t border-rose-500/20">
                <div className="flex items-center gap-1.5 text-rose-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">{pendentes} débito{pendentes !== 1 ? 's' : ''} pendente{pendentes !== 1 ? 's' : ''}</span>
                </div>
                <span className="text-rose-400 font-mono text-sm font-semibold">- {fmtBRL(totalPendente)}</span>
              </div>
            )}
          </div>

          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Custos Fixos</p>

          <div className="flex items-center gap-2 mb-1">
            <div className="flex-1">
              <FieldRow label="NF / Impostos" value={custoNf} onChange={setCustoNf} pago={custosPagos.nf} onTogglePago={() => togglePago('nf')} />
            </div>
            <select
              value={custoNfTipo}
              onChange={e => setCustoNfTipo(e.target.value)}
              className="text-xs bg-dark-card border border-white/10 rounded px-1.5 py-1 text-slate-400 focus:outline-none"
            >
              <option value="fixo">R$ fixo</option>
              <option value="percentual">%</option>
            </select>
          </div>

          <FieldRow label="Fornecedor (equipamentos)" value={custoFornecedor} onChange={setCustoFornecedor} pago={custosPagos.fornecedor} onTogglePago={() => togglePago('fornecedor')} />
          <div className="flex items-center justify-between py-2 border-b border-white/5">
            <span className="text-xs text-slate-400">Voucher banco (%)</span>
            <div className="flex items-center gap-1">
              <input
                type="number" min={0} max={100} step={0.1}
                value={voucherBancoPct ?? ''}
                onChange={e => setVoucherBancoPct(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-16 text-right text-xs bg-dark-card border border-white/10 rounded px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-primary-500/30"
              />
              <span className="text-xs text-slate-500">%</span>
              {(voucherBancoPct || 0) > 0 && (custoFornecedor || 0) > 0 && (
                <span className="text-[10px] text-emerald-400 ml-1">
                  − {((custoFornecedor || 0) * (voucherBancoPct || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              )}
            </div>
          </div>
          <FieldRow label="Engenharia / Projeto" value={custoEngenharia} onChange={setCustoEngenharia} pago={custosPagos.engenharia} onTogglePago={() => togglePago('engenharia')} />
          <FieldRow label="ART" value={custoArt} onChange={setCustoArt} pago={custosPagos.art} onTogglePago={() => togglePago('art')} />
          <FieldRow label="Corrugado" value={custoCorrugado} onChange={setCustoCorrugado} pago={custosPagos.corrugado} onTogglePago={() => togglePago('corrugado')} />
          <FieldRow label="Eletroduto" value={custoEletroduto} onChange={setCustoEletroduto} pago={custosPagos.eletroduto} onTogglePago={() => togglePago('eletroduto')} />
          <FieldRow label="Comissão" value={comissaoValor} onChange={setComissaoValor} pago={custosPagos.comissao} onTogglePago={() => togglePago('comissao')} />

          {/* Custos Extras */}
          <div className="pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Custos Extras / Imprevistos</p>
              <button
                onClick={addExtra}
                className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar
              </button>
            </div>

            {custosExtras.length === 0 && (
              <p className="text-xs text-slate-500 italic px-3">Nenhum custo extra registrado.</p>
            )}

            {custosExtras.map((extra, i) => {
              const isPago = !!(custosPagos.extras || [])[i];
              return (
              <div key={i} className={cn(
                'flex items-center gap-2 py-1.5 px-3 rounded-lg transition-colors',
                extra.valor > 0 && !isPago ? 'bg-rose-500/8 border border-rose-500/15' : 'hover:bg-white/5'
              )}>
                {extra.valor > 0 ? (
                  <button onClick={() => toggleExtraPago(i)} className="shrink-0 transition-colors" title={isPago ? 'Marcar como pendente' : 'Marcar como pago'}>
                    {isPago
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      : <XCircle className="h-4 w-4 text-rose-500 hover:text-rose-400" />}
                  </button>
                ) : <div className="w-4 shrink-0" />}
                <input
                  placeholder="Descrição do custo"
                  value={extra.descricao ?? ''}
                  onChange={e => updateExtra(i, 'descricao', e.target.value)}
                  className={cn('flex-1 bg-transparent text-sm border-b border-white/10 focus:border-primary-500 focus:outline-none pb-0.5',
                    'placeholder-slate-600',
                    isPago && extra.valor > 0 ? 'text-slate-500 line-through' : extra.descricao ? 'text-white' : 'text-slate-400')}
                />
                <input
                  placeholder="0,00"
                  value={extra.valor > 0 ? extra.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''}
                  onChange={e => updateExtra(i, 'valor', parseBRL(e.target.value))}
                  className="w-28 text-right bg-transparent text-sm font-mono text-white border-b border-white/10 focus:border-primary-500 focus:outline-none pb-0.5"
                />
                <button onClick={() => removeExtra(i)} className="p-1 hover:text-rose-400 text-slate-500 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              );
            })}

            {somaExtras > 0 && (
              <div className="flex justify-between px-3 py-1.5 mt-1 border-t border-white/5 text-xs">
                <span className="text-slate-400">Total Extras</span>
                <span className="text-rose-300 font-mono">{fmtBRL(somaExtras)}</span>
              </div>
            )}
          </div>

          {/* Totalizador final */}
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Receita</span>
              <span className="text-white font-mono">{fmtBRL(receita)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">(-) Custo total</span>
              <span className="text-rose-300 font-mono">- {fmtBRL(custoTotalCalc)}</span>
            </div>
            <div className="h-px bg-white/10" />
            <div className="flex justify-between text-sm font-semibold">
              <span className={lucroBruto >= 0 ? 'text-emerald-400' : 'text-rose-400'}>Lucro Bruto</span>
              <span className={cn('font-mono', lucroBruto >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                {fmtBRL(lucroBruto)} ({margemPct.toFixed(1)}%)
              </span>
            </div>
            {totalPendente > 0 && (
              <>
                <div className="h-px bg-white/10" />
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Lucro após quitar pendências</span>
                  <span className={cn('font-mono', (caixaAtual - totalPendente) >= 0 ? 'text-slate-400' : 'text-rose-400')}>
                    {fmtBRL(caixaAtual - totalPendente)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 shrink-0">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-60 text-white font-medium rounded-xl py-2.5 text-sm transition-colors"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Salvando...' : 'Salvar Financeiro'}
          </button>
        </div>
      </div>
    </div>
  );
}
