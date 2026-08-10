'use client';

import React, { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { TrendingUp, DollarSign, Loader2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useFinancialData, type FinancialDeal } from '../hooks/useFinancialData';
import type { PeriodFilter } from '../../dashboard/hooks/useDashboardMetrics';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const BRL2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const PCT = (v: number) => `${v.toFixed(1)}%`;

function margemColor(m: number, dark = false) {
  if (m >= 20) return dark ? '#34d399' : '#059669';
  if (m >= 10) return dark ? '#fbbf24' : '#d97706';
  return dark ? '#f87171' : '#dc2626';
}

function margemBadge(m: number) {
  const base = 'inline-block px-2 py-0.5 rounded-full text-xs font-bold';
  if (m >= 20) return `${base} bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300`;
  if (m >= 10) return `${base} bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300`;
  return `${base} bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300`;
}

interface Props {
  period: PeriodFilter;
  boardId?: string;
}

export function FinancialTab({ period, boardId }: Props) {
  const { deals, summary, monthlyMargins, loading, error } = useFinancialData(period, boardId);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-slate-500">
      <Loader2 className="w-6 h-6 animate-spin mr-2" />
      <span className="text-sm">Carregando dados financeiros...</span>
    </div>
  );

  if (error) return (
    <div className="flex items-center gap-2 text-red-500 text-sm py-6">
      <AlertCircle className="w-4 h-4 shrink-0" />
      {error}
    </div>
  );

  if (deals.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
      <DollarSign className="w-10 h-10 mb-3 opacity-30" />
      <p className="text-sm font-medium">Nenhum negócio fechado com custos registrados no período.</p>
      <p className="text-xs mt-1 text-slate-400">Preencha os custos no painel de cada deal para vê-los aqui.</p>
    </div>
  );

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl p-3 shadow-lg text-xs">
        <p className="font-bold text-slate-700 dark:text-white mb-1">{label}</p>
        <p className="text-slate-500">Receita: <span className="font-semibold text-slate-800 dark:text-white">{BRL.format(payload[0]?.payload?.receita ?? 0)}</span></p>
        <p className="text-slate-500">Lucro: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{BRL.format(payload[0]?.payload?.lucro ?? 0)}</span></p>
        <p className="text-slate-500">Margem: <span className="font-bold" style={{ color: margemColor(payload[0]?.value ?? 0) }}>{PCT(payload[0]?.value ?? 0)}</span></p>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Receita Total', value: BRL.format(summary.receitaTotal), sub: `${summary.dealsCount} deals fechados`, color: 'blue' },
          { label: 'Custo Total', value: BRL.format(summary.custoTotal), sub: `${PCT((summary.receitaTotal > 0 ? summary.custoTotal / summary.receitaTotal : 0) * 100)} da receita`, color: 'orange' },
          { label: 'Comissões', value: BRL.format(summary.comissaoTotal), sub: `${PCT(summary.receitaTotal > 0 ? (summary.comissaoTotal / summary.receitaTotal) * 100 : 0)} da receita`, color: 'purple' },
          { label: 'Lucro Bruto', value: BRL.format(summary.lucroTotal), sub: PCT(summary.receitaTotal > 0 ? (summary.lucroTotal / summary.receitaTotal) * 100 : 0), color: 'emerald' },
          { label: 'Margem Média', value: PCT(summary.margemMedia), sub: summary.margemMedia >= 20 ? 'Saudável' : summary.margemMedia >= 10 ? 'Atenção' : 'Crítica', color: summary.margemMedia >= 20 ? 'emerald' : summary.margemMedia >= 10 ? 'amber' : 'red' },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="glass p-4 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className={`text-xl font-bold text-${color}-600 dark:text-${color}-400`}>{value}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Gráfico de margem por mês */}
      {monthlyMargins.length > 1 && (
        <div className="glass p-5 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-primary-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Margem por Mês</h3>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={monthlyMargins} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 13, fill: 'var(--chart-text, #94a3b8)' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fontSize: 13, fill: 'var(--chart-text, #94a3b8)' }} axisLine={false} tickLine={false} width={42} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(148,163,184,0.05)' }} />
              <ReferenceLine y={20} stroke="#34d399" strokeDasharray="4 3" strokeOpacity={0.5} label={{ value: '20%', fontSize: 11, fill: '#34d399', position: 'right' }} />
              <ReferenceLine y={10} stroke="#fbbf24" strokeDasharray="4 3" strokeOpacity={0.5} label={{ value: '10%', fontSize: 11, fill: '#fbbf24', position: 'right' }} />
              <Bar dataKey="margem" radius={[4, 4, 0, 0]} maxBarSize={48}>
                {monthlyMargins.map((m, i) => (
                  <Cell key={i} fill={margemColor(m.margem, true)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-400">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-400 inline-block rounded" /> Saudável ≥20%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-400 inline-block rounded" /> Atenção ≥10%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-400 inline-block rounded" /> Crítica &lt;10%</span>
          </div>
        </div>
      )}

      {/* Tabela de deals */}
      <div className="glass rounded-xl border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Negócios fechados</h3>
          <span className="text-xs text-slate-400">{deals.length} registro{deals.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/5">
                {['Cliente', 'Data', 'Receita', 'Custo Kit', 'Engenharia', 'NF', 'Comissão', 'Lucro', 'Margem', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deals.map((deal) => (
                <React.Fragment key={deal.id}>
                  <tr
                    className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50/50 dark:hover:bg-white/3 cursor-pointer transition-colors"
                    onClick={() => setExpandedId(expandedId === deal.id ? null : deal.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-white truncate max-w-[140px]">{deal.contactName}</div>
                      <div className="text-slate-400 truncate max-w-[140px]">{deal.title}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {deal.closedAt ? new Date(deal.closedAt).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-white whitespace-nowrap">
                      {BRL.format(deal.valorVenda)}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {deal.custoFornecedor > 0 ? BRL.format(deal.custoFornecedor) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {deal.custoEngenharia > 0 ? BRL.format(deal.custoEngenharia) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {deal.custoNf > 0 ? BRL.format(deal.custoNf) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {deal.comissaoValor > 0 ? BRL.format(deal.comissaoValor) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: margemColor(deal.margemPct) }}>
                      {BRL.format(deal.lucroBruto)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={margemBadge(deal.margemPct)}>{PCT(deal.margemPct)}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {expandedId === deal.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </td>
                  </tr>
                  {expandedId === deal.id && (
                    <tr className="bg-slate-50/80 dark:bg-white/3">
                      <td colSpan={10} className="px-6 py-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                          {[
                            { label: 'Nota Fiscal', value: deal.custoNf },
                            { label: 'ART Engenharia', value: deal.custoArt },
                            { label: 'Engenharia', value: deal.custoEngenharia },
                            { label: 'Corrugado', value: deal.custoCorrugado },
                            { label: 'Eletroduto', value: deal.custoEletroduto },
                            { label: 'Kit (Fornecedor)', value: deal.custoFornecedor },
                            { label: 'Comissão', value: deal.comissaoValor },
                            { label: 'Total de Custos', value: deal.custoTotal, bold: true },
                          ].map(({ label, value, bold }) => (
                            <div key={label} className={`rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-white/5 px-3 py-2 ${bold ? 'ring-1 ring-primary-500/20' : ''}`}>
                              <p className="text-slate-400 mb-0.5">{label}</p>
                              <p className={`font-semibold ${bold ? 'text-primary-600 dark:text-primary-400' : 'text-slate-700 dark:text-slate-200'}`}>
                                {value > 0 ? BRL2.format(value) : '—'}
                              </p>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
            {/* Totais */}
            <tfoot>
              <tr className="border-t-2 border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-white/3">
                <td className="px-4 py-3 font-bold text-slate-600 dark:text-slate-300" colSpan={2}>TOTAL</td>
                <td className="px-4 py-3 font-bold text-slate-900 dark:text-white whitespace-nowrap">{BRL.format(summary.receitaTotal)}</td>
                <td className="px-4 py-3 font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">{BRL.format(deals.reduce((s, d) => s + d.custoFornecedor, 0))}</td>
                <td className="px-4 py-3 font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">{BRL.format(deals.reduce((s, d) => s + d.custoEngenharia, 0))}</td>
                <td className="px-4 py-3 font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">{BRL.format(deals.reduce((s, d) => s + d.custoNf, 0))}</td>
                <td className="px-4 py-3 font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">{BRL.format(summary.comissaoTotal)}</td>
                <td className="px-4 py-3 font-bold whitespace-nowrap" style={{ color: margemColor(summary.margemMedia) }}>
                  {BRL.format(summary.lucroTotal)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={margemBadge(summary.margemMedia)}>{PCT(summary.margemMedia)}</span>
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
