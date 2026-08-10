'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { FileText, Pencil, Search, Loader2, RefreshCw, Zap } from 'lucide-react';

interface OrcafacilProposal {
  id: string;
  cliente_nome: string;
  cliente_cidade: string | null;
  potencia_kwp: number | null;
  valor_final: number | null;
  forma_pagamento: string | null;
  crm_deal_id: string | null;
  created_at: string;
}

function fmtBRL(v: number | null) {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

const ORCAFACIL_BASE = 'https://app-eight-eta-92.vercel.app';

export function OrcamentosPage() {
  const [proposals, setProposals] = useState<OrcafacilProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchProposals = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/orcafacil/list');
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setProposals(json.orcamentos ?? []);
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar orçamentos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProposals(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return proposals;
    const q = search.toLowerCase();
    return proposals.filter(p =>
      (p.cliente_nome || '').toLowerCase().includes(q) ||
      (p.cliente_cidade || '').toLowerCase().includes(q)
    );
  }, [proposals, search]);

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
            <p className="text-xs text-slate-400 mt-0.5">
              Orçamentos do OrçaFácil · Edite e gere PDF diretamente lá
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchProposals}
              disabled={loading}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
              title="Atualizar lista"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <a
              href={`${ORCAFACIL_BASE}/dashboard`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 bg-orange-500 hover:bg-orange-400 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              <Zap className="h-4 w-4" />
              Novo no OrçaFácil
            </a>
          </div>
        </div>

        {/* Busca */}
        <div className="max-w-5xl mx-auto px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por cliente ou cidade..."
              className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            />
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {loading ? (
          <div className="py-20 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
            <p className="text-slate-400 text-sm">Carregando orçamentos do OrçaFácil...</p>
          </div>
        ) : error ? (
          <div className="py-20 text-center">
            <p className="text-red-400 text-sm mb-3">{error}</p>
            <button onClick={fetchProposals} className="text-xs text-slate-400 hover:text-white underline">Tentar novamente</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <FileText className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">
              {search ? 'Nenhum resultado para a busca.' : 'Nenhum orçamento encontrado no OrçaFácil.'}
            </p>
          </div>
        ) : (
          <div className="bg-dark-card rounded-2xl border border-white/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <span className="text-xs text-slate-400">{filtered.length} orçamento{filtered.length !== 1 ? 's' : ''}</span>
              <span className="text-xs text-slate-500">Fonte: OrçaFácil</span>
            </div>
            <div className="divide-y divide-white/5">
              {filtered.map(p => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition-colors group"
                >
                  {/* Ícone */}
                  <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-orange-400" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{p.cliente_nome || '—'}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      {p.cliente_cidade && (
                        <span className="text-xs text-slate-400">{p.cliente_cidade}</span>
                      )}
                      {p.potencia_kwp != null && p.potencia_kwp > 0 && (
                        <span className="text-xs text-slate-500">{p.potencia_kwp} kWp</span>
                      )}
                      {p.forma_pagamento && (
                        <span className="text-xs text-slate-500 truncate max-w-[160px]">{p.forma_pagamento}</span>
                      )}
                    </div>
                  </div>

                  {/* Valor + Data */}
                  <div className="text-right shrink-0 hidden sm:block">
                    <p className="text-sm font-mono font-medium text-white">{fmtBRL(p.valor_final)}</p>
                    <p className="text-[11px] text-slate-500">{fmtDate(p.created_at)}</p>
                  </div>

                  {/* Ação */}
                  <a
                    href={`${ORCAFACIL_BASE}/orcamento/${p.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Editar no OrçaFácil"
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-lg text-xs font-medium hover:bg-orange-500/20 hover:text-orange-300 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
