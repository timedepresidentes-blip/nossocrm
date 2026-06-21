import React from 'react';
import { Users } from 'lucide-react';
import type { AgentStat } from '@/lib/query/hooks/useMessagingMetricsQuery';

interface AgentPerformanceTableProps {
  data: AgentStat[];
}

function formatSeconds(seconds: number): string {
  if (seconds === 0) return '--';
  if (seconds < 60) return '< 1min';
  if (seconds < 3600) {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return sec > 0 ? `${min}min ${sec}s` : `${min}min`;
  }
  const hours = Math.floor(seconds / 3600);
  const min = Math.floor((seconds % 3600) / 60);
  return min > 0 ? `${hours}h ${min}min` : `${hours}h`;
}

// Gera iniciais para avatar
function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

// Cores de avatar por índice
const AVATAR_COLORS = [
  'bg-indigo-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-sky-500',
  'bg-purple-500',
];

export function AgentPerformanceTable({ data }: AgentPerformanceTableProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-slate-400 dark:text-slate-500 gap-2">
        <Users size={16} />
        Nenhum atendente com conversas no período
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 dark:border-white/5">
            <th className="text-left py-2 px-3 font-medium text-slate-500 dark:text-slate-400">
              Atendente
            </th>
            <th className="text-right py-2 px-3 font-medium text-slate-500 dark:text-slate-400">
              Atendimentos
            </th>
            <th className="text-right py-2 px-3 font-medium text-slate-500 dark:text-slate-400">
              Mensagens
            </th>
            <th className="text-right py-2 px-3 font-medium text-slate-500 dark:text-slate-400">
              Tempo Médio
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((agent, i) => (
            <tr
              key={agent.user_id ?? i}
              className="border-b border-slate-50 dark:border-white/[0.03] hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
            >
              <td className="py-2.5 px-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0 ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}
                  >
                    {initials(agent.name)}
                  </div>
                  <span className="font-medium text-slate-700 dark:text-slate-200 truncate max-w-[140px]">
                    {agent.name}
                  </span>
                </div>
              </td>
              <td className="py-2.5 px-3 text-right font-semibold text-slate-900 dark:text-white">
                {agent.conversations}
              </td>
              <td className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-300">
                {agent.messages}
              </td>
              <td className="py-2.5 px-3 text-right text-slate-500 dark:text-slate-400">
                {formatSeconds(agent.avg_response_seconds)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
