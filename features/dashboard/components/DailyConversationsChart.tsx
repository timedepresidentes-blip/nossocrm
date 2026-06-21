import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface DailyConversationsChartProps {
  data: Array<{ date: string; count: number }>;
}

// Formata "2026-06-15" → "15/06"
function formatDate(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
}

export function DailyConversationsChart({ data }: DailyConversationsChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-slate-400 dark:text-slate-500">
        Sem dados no período
      </div>
    );
  }

  const chartData = data.map((d) => ({ ...d, label: formatDate(d.date) }));

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barSize={20}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.15)" />
        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--chart-text, #94a3b8)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: 'var(--chart-text, #94a3b8)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: 'rgba(148,163,184,0.08)' }}
          formatter={(value: number) => [value, 'Atendimentos']}
          labelFormatter={(label) => `Dia ${label}`}
          contentStyle={{
            backgroundColor: 'var(--chart-tooltip-bg, #1e293b)',
            border: '1px solid var(--chart-tooltip-border, #334155)',
            borderRadius: '8px',
            color: 'var(--chart-tooltip-text, #e2e8f0)',
            fontSize: '12px',
          }}
        />
        <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
