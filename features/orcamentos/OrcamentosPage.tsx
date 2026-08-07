'use client';

import React, { useState, useMemo } from 'react';
import { useDeals } from '@/lib/query/hooks/useDealsQuery';
import { FileText, ExternalLink, Pencil, Search, Trophy, XCircle, Clock, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function StatusChip({ deal }: { deal: { isWon: boolean; isLost: boolean } }) {
  if (deal.isWon) return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
      <Trophy className="h-2.5 w-2.5" /> Ganho
    </span>
  );
  if (deal.isLost) return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/20">
      <XCircle className="h-2.5 w-2.5" /> Perdido
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">
      <Clock className="h-2.5 w-2.5" /> Em aberto
    </span>
  );
}

export function OrcamentosPage() {
  const { data: deals = [], isLoading } = useDeals();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'abertos' | 'ganhos' | 'perdidos'>('todos');

  const filtered = useMemo(() => {
    let list = [...deals].sort((a, b) =>
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
    if (filtro === 'abertos') list = list.filter(d => !d.isWon && !d.isLost);
    if (filtro === 'ganhos') list = list.filter(d => d.isWon);
    if (filtro === 'perdidos') list = list.filter(d => d.isLost);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        (d.title || '').toLowerCase().includes(q) ||
        (d.fichaCliente?.nomeCompleto || '').toLowerCase().includes(q) ||
        (d.contactName || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [deals, search, filtro]);

  const handleVer = (dealId: string) => {
    window.open(`/deals/${dealId}/quote`, '_blank');
  };

  const handleEditar = (dealId: string) => {
    router.push(`/deals/${dealId}/quote?edit=1`);
  };

  const FILTROS = [
    { id: 'todos', label: 'Todos' },
    { id: 'abertos', label: 'Em aberto' },
    { id: 'ganhos', label: 'Ganhos' },
    { id: 'perdidos', label: 'Perdidos' },
  ] as const;

  return (
    <div className="min-h-screen bg-dark text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-dark-card/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-white flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary-400" />
              Orçamentos
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">Todos os orçamentos gerados pelo CRM</p>
          </div>

          {/* Filtros */}
          <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1">
            {FILTROS.map(f => (
              <button
                key={f.id}
                onClick={() => setFiltro(f.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  filtro === f.id
                    ? 'bg-primary-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Busca */}
        <div className="max-w-5xl mx-auto px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por cliente ou título..."
              className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            />
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="py-20 text-center text-slate-400 text-sm">Carregando orçamentos...</div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <FileText className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Nenhum orçamento encontrado.</p>
          </div>
        ) : (
          <div className="bg-dark-card rounded-2xl border border-white/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10">
              <span className="text-xs text-slate-400">{filtered.length} orçamento{filtered.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="divide-y divide-white/5">
              {filtered.map(deal => {
                const nomeCliente = deal.fichaCliente?.nomeCompleto || deal.contactName || deal.title;
                const titulo = deal.title;
                const data = deal.createdAt ? fmtDate(deal.createdAt) : '—';

                return (
                  <div
                    key={deal.id}
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition-colors group"
                  >
                    {/* Ícone */}
                    <div className="w-9 h-9 rounded-xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-primary-400" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{nomeCliente}</p>
                      <p className="text-xs text-slate-400 truncate">{titulo}</p>
                    </div>

                    {/* Status */}
                    <div className="hidden sm:block shrink-0">
                      <StatusChip deal={deal} />
                    </div>

                    {/* Valor */}
                    <div className="text-right shrink-0 hidden sm:block">
                      <p className="text-sm font-mono font-medium text-white">
                        {deal.value ? fmtBRL(deal.value) : '—'}
                      </p>
                      <p className="text-[11px] text-slate-500">{data}</p>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleEditar(deal.id)}
                        title="Editar orçamento"
                        className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleVer(deal.id)}
                        title="Ver orçamento"
                        className="p-2 rounded-lg text-slate-400 hover:text-primary-400 hover:bg-primary-500/10 transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                      <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-primary-400 transition-colors ml-1" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
