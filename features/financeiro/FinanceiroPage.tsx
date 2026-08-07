'use client';
import React, { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDeals } from '@/lib/query/hooks/useDealsQuery';
import { DEALS_VIEW_KEY } from '@/lib/query/queryKeys';
import { Deal } from '@/types';
import { DealFinanceiroSheet } from './components/DealFinanceiroSheet';
import { autoFillDealCosts } from '@/lib/supabase/autoFillDealCosts';
import { TrendingUp, TrendingDown, DollarSign, Percent, BarChart3, ChevronRight, AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

type Periodo = 'all' | 'this_month' | 'last_month' | 'last_3_months' | 'this_year';

const PERIODOS: { value: Periodo; label: string }[] = [
  { value: 'all', label: 'Todas as Vendas' },
  { value: 'this_month', label: 'Este Mês' },
  { value: 'last_month', label: 'Mês Passado' },
  { value: 'last_3_months', label: 'Últimos 3 Meses' },
  { value: 'this_year', label: 'Este Ano' },
];

function getRange(periodo: Periodo): { start: Date; end: Date } {
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  switch (periodo) {
    case 'all':
      return { start: new Date(2000, 0, 1), end: endOfToday };
    case 'this_month':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: endOfToday };
    case 'last_month': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { start: s, end: e };
    }
    case 'last_3_months': {
      const s = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      return { start: s, end: endOfToday };
    }
    case 'this_year':
      return { start: new Date(now.getFullYear(), 0, 1), end: endOfToday };
  }
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtKwp(v: number | null | undefined) {
  if (v == null) return '—';
  return `${v.toFixed(2)} kWp`;
}

function StatusMargem({ pct }: { pct: number | undefined }) {
  if (pct == null) return <span className="text-slate-500 text-xs">—</span>;
  const color = pct >= 20 ? 'text-emerald-400' : pct >= 10 ? 'text-yellow-400' : 'text-rose-400';
  return <span className={cn('text-sm font-mono font-medium', color)}>{pct.toFixed(1)}%</span>;
}

export function FinanceiroPage() {
  const { data: allDeals = [], isLoading } = useDeals();
  const queryClient = useQueryClient();
  const [periodo, setPeriodo] = useState<Periodo>('all');
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [syncing, setSyncing] = useState(false);

  const { start, end } = useMemo(() => getRange(periodo), [periodo]);

  const wonDeals = useMemo(() => {
    return allDeals.filter(d => {
      if (!d.isWon) return false;
      const ref = d.closedAt || d.updatedAt;
      if (!ref) return false;
      const dt = new Date(ref);
      return dt >= start && dt <= end;
    });
  }, [allDeals, start, end]);

  // Métricas agregadas
  const totais = useMemo(() => {
    let receita = 0, custos = 0, lucro = 0, kwpTotal = 0, comDetalhe = 0;
    for (const d of wonDeals) {
      receita += d.value || 0;
      const c = d.custoTotal || 0;
      custos += c;
      lucro += d.lucroBruto ?? (d.value - c);
      kwpTotal += d.fichaCliente?.potenciaKwp || 0;
      if (d.custoFornecedor || d.custoNf || d.custoEngenharia) comDetalhe++;
    }
    const margem = receita > 0 ? (lucro / receita) * 100 : 0;
    return { receita, custos, lucro, margem, kwpTotal, comDetalhe };
  }, [wonDeals]);

  const semFinanceiro = wonDeals.filter(d => !d.custoFornecedor && !d.custoNf && !d.custoTotal);

  const handleSincronizarTodos = async () => {
    setSyncing(true);
    await Promise.allSettled(semFinanceiro.map(d => autoFillDealCosts(d.id)));
    await queryClient.invalidateQueries({ queryKey: DEALS_VIEW_KEY });
    setSyncing(false);
  };

  return (
    <div className="min-h-screen bg-dark text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-dark-card/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-white flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary-400" />
              Financeiro
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">Gestão financeira das vendas</p>
          </div>
          {/* Filtro de período */}
          <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1">
            {PERIODOS.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriodo(p.value)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  periodo === p.value
                    ? 'bg-primary-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Cards de resumo */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard
            label="Total Vendido"
            value={fmtBRL(totais.receita)}
            sub={`${wonDeals.length} venda${wonDeals.length !== 1 ? 's' : ''}`}
            icon={<DollarSign className="h-4 w-4 text-primary-400" />}
          />
          <SummaryCard
            label="Total Custos"
            value={fmtBRL(totais.custos)}
            sub={`${totais.comDetalhe} com detalhe`}
            icon={<TrendingDown className="h-4 w-4 text-rose-400" />}
            colorClass="text-rose-300"
          />
          <SummaryCard
            label="Lucro Bruto"
            value={fmtBRL(totais.lucro)}
            sub={totais.custos > 0 ? 'após todos os custos' : 'sem custos lançados'}
            icon={totais.lucro >= 0
              ? <TrendingUp className="h-4 w-4 text-emerald-400" />
              : <TrendingDown className="h-4 w-4 text-rose-400" />}
            colorClass={totais.lucro >= 0 ? 'text-emerald-400' : 'text-rose-400'}
          />
          <SummaryCard
            label="Margem Média"
            value={`${totais.margem.toFixed(1)}%`}
            sub={`${fmtKwp(totais.kwpTotal)} vendidos`}
            icon={<Percent className="h-4 w-4 text-yellow-400" />}
            colorClass={totais.margem >= 20 ? 'text-emerald-400' : totais.margem >= 10 ? 'text-yellow-400' : 'text-rose-400'}
          />
        </div>

        {/* Aviso se há vendas sem financeiro */}
        {semFinanceiro.length > 0 && (
          <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                <strong>{semFinanceiro.length}</strong> venda{semFinanceiro.length > 1 ? 's' : ''} sem custos lançados.
                Clique na venda para editar manualmente ou sincronize com os padrões da organização.
              </span>
            </div>
            <button
              onClick={handleSincronizarTodos}
              disabled={syncing}
              className="flex items-center gap-1.5 shrink-0 text-xs font-medium bg-yellow-500/20 hover:bg-yellow-500/30 disabled:opacity-60 px-3 py-1.5 rounded-lg transition-colors"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
              {syncing ? 'Sincronizando...' : 'Sincronizar Padrões'}
            </button>
          </div>
        )}

        {/* Tabela de vendas */}
        <div className="bg-dark-card rounded-2xl border border-white/10 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-300">
              Vendas ({wonDeals.length})
            </h2>
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-slate-400 text-sm">Carregando...</div>
          ) : wonDeals.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              Nenhuma venda encontrada no período selecionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-400 uppercase tracking-wider">Cliente</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400 uppercase tracking-wider">kWp</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400 uppercase tracking-wider">Receita</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400 uppercase tracking-wider">Custo</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400 uppercase tracking-wider">Lucro</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400 uppercase tracking-wider">Margem</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {wonDeals.map(deal => {
                    const kwp = deal.fichaCliente?.potenciaKwp ?? null;
                    const receita = deal.value || 0;
                    const custo = deal.custoTotal || 0;
                    const lucro = deal.lucroBruto ?? (receita - custo);
                    const margem = deal.margemPct ?? (receita > 0 ? (lucro / receita) * 100 : undefined);
                    const nomeCliente = deal.fichaCliente?.nomeCompleto || deal.title;
                    const temFinanceiro = !!(deal.custoFornecedor || deal.custoNf || deal.custoTotal);

                    return (
                      <tr
                        key={deal.id}
                        onClick={() => setSelectedDeal(deal)}
                        className="hover:bg-white/5 cursor-pointer transition-colors group"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {!temFinanceiro && (
                              <AlertTriangle className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
                            )}
                            <div>
                              <p className="text-sm font-medium text-white truncate max-w-[220px]">{nomeCliente}</p>
                              {deal.closedAt && (
                                <p className="text-xs text-slate-500">
                                  {new Date(deal.closedAt).toLocaleDateString('pt-BR')}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-mono text-slate-300">{fmtKwp(kwp)}</td>
                        <td className="px-4 py-3 text-right text-sm font-mono text-white">{fmtBRL(receita)}</td>
                        <td className="px-4 py-3 text-right text-sm font-mono text-rose-300">
                          {custo > 0 ? fmtBRL(custo) : <span className="text-slate-500">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-mono">
                          {custo > 0 ? (
                            <span className={lucro >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              {fmtBRL(lucro)}
                            </span>
                          ) : <span className="text-slate-500">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <StatusMargem pct={custo > 0 ? margem : undefined} />
                        </td>
                        <td className="px-4 py-3">
                          <ChevronRight className="h-4 w-4 text-slate-500 group-hover:text-primary-400 transition-colors ml-auto" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Sheet de detalhe */}
      <DealFinanceiroSheet
        deal={selectedDeal}
        isOpen={!!selectedDeal}
        onClose={() => setSelectedDeal(null)}
      />
    </div>
  );
}

function SummaryCard({
  label, value, sub, icon, colorClass,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  colorClass?: string;
}) {
  return (
    <div className="bg-dark-card border border-white/10 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className={cn('text-xl font-semibold', colorClass || 'text-white')}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}
