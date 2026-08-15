'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { PeriodFilter } from '../../dashboard/hooks/useDashboardMetrics';

export interface FinancialDeal {
  id: string;
  title: string;
  contactName: string;
  closedAt: string;
  valorVenda: number;
  custoTotal: number;
  lucroBruto: number;
  margemPct: number;
  comissaoValor: number;
  custoNf: number;
  custoEngenharia: number;
  custoCorrugado: number;
  custoEletroduto: number;
  custoFornecedor: number;
}

export interface FinancialSummary {
  receitaTotal: number;
  custoTotal: number;
  lucroTotal: number;
  margemMedia: number;
  comissaoTotal: number;
  dealsCount: number;
}

export interface MonthlyMargin {
  month: string;
  receita: number;
  lucro: number;
  margem: number;
}

export interface FinancialData {
  deals: FinancialDeal[];
  summary: FinancialSummary;
  monthlyMargins: MonthlyMargin[];
  loading: boolean;
  error: string | null;
}

const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function getDateRange(period: PeriodFilter): { start: Date; end: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

  switch (period) {
    case 'all': return { start: new Date(2000, 0, 1), end: endOfToday };
    case 'today': return { start: today, end: endOfToday };
    case 'yesterday': {
      const start = new Date(today); start.setDate(start.getDate() - 1);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999);
      return { start, end };
    }
    case 'last_7_days': {
      const start = new Date(today); start.setDate(start.getDate() - 6);
      return { start, end: endOfToday };
    }
    case 'last_30_days': {
      const start = new Date(today); start.setDate(start.getDate() - 29);
      return { start, end: endOfToday };
    }
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start, end: endOfToday };
    }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start, end };
    }
    case 'this_quarter': {
      const q = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), q * 3, 1);
      return { start, end: endOfToday };
    }
    case 'last_quarter': {
      const q = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), (q - 1) * 3, 1);
      const end = new Date(now.getFullYear(), q * 3, 0, 23, 59, 59, 999);
      return { start, end };
    }
    case 'this_year': {
      const start = new Date(now.getFullYear(), 0, 1);
      return { start, end: endOfToday };
    }
    case 'last_year': {
      const start = new Date(now.getFullYear() - 1, 0, 1);
      const end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      return { start, end };
    }
    default: {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start, end: endOfToday };
    }
  }
}

export function useFinancialData(period: PeriodFilter, boardId?: string): FinancialData {
  const [deals, setDeals] = useState<FinancialDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { start, end } = getDateRange(period);

        let query = (supabase as any)
          .from('deals')
          .select(`
            id, title, board_id, closed_at, value,
            custo_total, lucro_bruto, margem_pct, comissao_valor,
            custo_nf, custo_engenharia, custo_corrugado,
            custo_eletroduto, custo_fornecedor,
            contacts ( name )
          `)
          .eq('is_won', true)
          .gte('closed_at', start.toISOString())
          .lte('closed_at', end.toISOString())
          .order('closed_at', { ascending: false });

        if (boardId) query = query.eq('board_id', boardId);

        const { data, error: dbErr } = await query;
        if (dbErr) { setError(dbErr.message); setLoading(false); return; }

        const mapped: FinancialDeal[] = (data || []).map((r: any) => ({
          id: r.id,
          title: r.title || '—',
          contactName: r.contacts?.name || '—',
          closedAt: r.closed_at || '',
          valorVenda: Number(r.value ?? 0),
          custoTotal: Number(r.custo_total ?? 0),
          lucroBruto: Number(r.lucro_bruto ?? 0),
          margemPct: Number(r.margem_pct ?? 0),
          comissaoValor: Number(r.comissao_valor ?? 0),
          custoNf: Number(r.custo_nf ?? 0),
          custoEngenharia: Number(r.custo_engenharia ?? 0),
          custoCorrugado: Number(r.custo_corrugado ?? 0),
          custoEletroduto: Number(r.custo_eletroduto ?? 0),
          custoFornecedor: Number(r.custo_fornecedor ?? 0),
        }));

        setDeals(mapped);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [period, boardId]);

  const summary: FinancialSummary = {
    receitaTotal: deals.reduce((s, d) => s + d.valorVenda, 0),
    custoTotal: deals.reduce((s, d) => s + d.custoTotal, 0),
    lucroTotal: deals.reduce((s, d) => s + d.lucroBruto, 0),
    comissaoTotal: deals.reduce((s, d) => s + d.comissaoValor, 0),
    margemMedia: deals.length > 0
      ? deals.reduce((s, d) => s + d.margemPct, 0) / deals.length
      : 0,
    dealsCount: deals.length,
  };

  const monthMap: Record<string, { receita: number; lucro: number }> = {};
  deals.forEach(d => {
    if (!d.closedAt) return;
    const dt = new Date(d.closedAt);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    if (!monthMap[key]) monthMap[key] = { receita: 0, lucro: 0 };
    monthMap[key].receita += d.valorVenda;
    monthMap[key].lucro += d.lucroBruto;
  });

  const monthlyMargins: MonthlyMargin[] = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => {
      const [, m] = key.split('-');
      return {
        month: MONTHS_PT[parseInt(m, 10) - 1],
        receita: v.receita,
        lucro: v.lucro,
        margem: v.receita > 0 ? (v.lucro / v.receita) * 100 : 0,
      };
    });

  return { deals, summary, monthlyMargins, loading, error };
}
