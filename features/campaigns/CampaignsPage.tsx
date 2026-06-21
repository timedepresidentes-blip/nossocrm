'use client';

import React, { useState, useMemo } from 'react';
import {
  Megaphone, Search, ChevronRight, CheckSquare, Square, Send, AlertCircle,
  CheckCircle, Clock, XCircle, Filter, RefreshCw, BarChart2, MessageSquare,
  CalendarClock, Zap,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useCampaignsQuery, useStalledDealsQuery, useCampaignRecipientsQuery, type StalledDeal, type Campaign } from '@/lib/query/hooks/useCampaignsQuery';
import { useQuery } from '@tanstack/react-query';
import { getClient } from '@/lib/supabase/client';
import { useQuickReplies } from '@/lib/query/hooks/useQuickRepliesQuery';
import { QuickRepliesMenu } from '@/features/messaging/components/QuickRepliesMenu';

// ─── Tipos auxiliares ────────────────────────────────────────────────────────

interface Board { id: string; name: string; }
interface Stage { id: string; name: string; color: string; }
interface Channel { id: string; name: string; provider: string; }

// ─── Hooks auxiliares ─────────────────────────────────────────────────────────

function useBoardsQuery() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const sb = getClient();
  return useQuery({
    queryKey: ['boards_list', orgId],
    queryFn: async () => {
      const { data } = await sb.from('boards').select('id, name').eq('organization_id', orgId!).order('name');
      return (data ?? []) as Board[];
    },
    enabled: !!orgId,
  });
}

function useBoardStagesQuery(boardId: string | null) {
  const sb = getClient();
  return useQuery({
    queryKey: ['board_stages', boardId],
    queryFn: async () => {
      const { data } = await sb.from('board_stages').select('id, name, color').eq('board_id', boardId!).order('order');
      return (data ?? []) as Stage[];
    },
    enabled: !!boardId,
  });
}

function useChannelsQuery() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const sb = getClient();
  return useQuery({
    queryKey: ['channels_whatsapp', orgId],
    queryFn: async () => {
      const { data } = await sb.from('messaging_channels')
        .select('id, name, provider')
        .eq('organization_id', orgId!)
        .eq('channel_type', 'whatsapp')
        .eq('status', 'connected');
      return (data ?? []) as Channel[];
    },
    enabled: !!orgId,
  });
}

// ─── Formatadores ─────────────────────────────────────────────────────────────

function daysLabel(n: number) {
  if (n === 1) return '1 dia';
  return `${n} dias`;
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function CampaignResultsView({ campaign }: { campaign: Campaign }) {
  const { data: recipients = [], isLoading } = useCampaignRecipientsQuery(campaign.id);
  const byStatus = useMemo(() => {
    const map: Record<string, typeof recipients> = { sent: [], failed: [], skipped: [], pending: [] };
    recipients.forEach((r) => (map[r.status] ??= []).push(r));
    return map;
  }, [recipients]);

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Enviadas',  count: campaign.sentCount,   color: 'text-green-500',  bg: 'bg-green-100 dark:bg-green-500/10' },
          { label: 'Falharam', count: campaign.failedCount,  color: 'text-red-500',    bg: 'bg-red-100 dark:bg-red-500/10' },
          { label: 'Total',    count: campaign.totalCount,   color: 'text-indigo-500', bg: 'bg-indigo-100 dark:bg-indigo-500/10' },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-xl p-4 text-center`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Lista de resultados */}
      <div className="glass rounded-xl border border-slate-200 dark:border-white/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-white/5">
              <th className="text-left p-3 font-medium text-slate-500">Contato</th>
              <th className="text-left p-3 font-medium text-slate-500">Negócio</th>
              <th className="text-left p-3 font-medium text-slate-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={3} className="p-8 text-center text-slate-400">Carregando...</td></tr>
            ) : recipients.length === 0 ? (
              <tr><td colSpan={3} className="p-8 text-center text-slate-400">Nenhum destinatário</td></tr>
            ) : recipients.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 dark:border-white/[0.03] hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                <td className="p-3 font-medium text-slate-700 dark:text-slate-200">{r.contactName ?? '—'}</td>
                <td className="p-3 text-slate-500 dark:text-slate-400 text-xs">{r.dealTitle}</td>
                <td className="p-3">
                  {r.status === 'sent' && <span className="flex items-center gap-1 text-green-500 text-xs"><CheckCircle size={12}/> Enviada</span>}
                  {r.status === 'failed' && <span className="flex items-center gap-1 text-red-500 text-xs" title={r.errorMessage ?? ''}><AlertCircle size={12}/> Falhou</span>}
                  {r.status === 'pending' && <span className="flex items-center gap-1 text-amber-500 text-xs"><Clock size={12}/> Enviando...</span>}
                  {r.status === 'skipped' && <span className="flex items-center gap-1 text-slate-400 text-xs"><XCircle size={12}/> Pulado</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

type Step = 'list' | 'source' | 'compose' | 'confirm' | 'results';

export function CampaignsPage() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  // Listagem de campanhas
  const { data: campaigns = [], refetch: refetchCampaigns } = useCampaignsQuery();
  const [step, setStep] = useState<Step>('list');
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  // Step "source"
  const { data: boards = [] } = useBoardsQuery();
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [stalledDays, setStalledDays] = useState(14);
  const [selectedStageIds, setSelectedStageIds] = useState<string[]>([]);
  const { data: stages = [] } = useBoardStagesQuery(selectedBoardId);
  const { data: stalledDeals = [], isLoading: loadingDeals, refetch: searchDeals } =
    useStalledDealsQuery(selectedBoardId, stalledDays, selectedStageIds);
  const [selectedDealIds, setSelectedDealIds] = useState<Set<string>>(new Set());
  const [searched, setSearched] = useState(false);

  // Step "compose"
  const [campaignName, setCampaignName] = useState('');
  const [message, setMessage] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const { data: channels = [] } = useChannelsQuery();
  const { data: allQuickReplies = [] } = useQuickReplies();
  const [qrActiveIndex, setQrActiveIndex] = useState(0);
  const qrQuery = message.startsWith('/') ? message.slice(1).toLowerCase() : null;
  const quickReplies = qrQuery !== null
    ? allQuickReplies.filter((r) => r.shortcut.startsWith(qrQuery) || r.title.toLowerCase().includes(qrQuery))
    : [];

  // Execução
  const [executing, setExecuting] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);

  const selectedDeals = stalledDeals.filter((d) => selectedDealIds.has(d.dealId));
  const validDeals = selectedDeals.filter((d) => d.hasWhatsApp);

  const toggleDeal = (id: string) => {
    setSelectedDealIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const withWa = stalledDeals.filter((d) => d.hasWhatsApp).map((d) => d.dealId);
    const allSelected = withWa.every((id) => selectedDealIds.has(id));
    setSelectedDealIds(allSelected ? new Set() : new Set(withWa));
  };

  const handleSearch = async () => {
    setSelectedDealIds(new Set());
    setSearched(true);
    await searchDeals();
  };

  const handleExecute = async () => {
    if (!orgId || validDeals.length === 0 || !message.trim() || !selectedChannelId) return;
    setExecuting(true);
    setExecutionError(null);

    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName || `Campanha ${new Date().toLocaleDateString('pt-BR')}`,
          message: message.trim(),
          channelId: selectedChannelId,
          deals: validDeals.map((d) => ({
            dealId: d.dealId,
            dealTitle: d.dealTitle,
            stageName: d.stageName,
            contactId: d.contactId,
            contactName: d.contactName,
            externalContactId: d.conversationExternalId ?? d.phone,
            conversationId: d.conversationId,
          })),
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erro ao criar campanha');

      // Executa imediatamente
      await fetch(`/api/campaigns/${json.id}/execute`, { method: 'POST' });

      await refetchCampaigns();
      const camp = { ...json, status: 'running', totalCount: validDeals.length, sentCount: 0, failedCount: 0 } as Campaign;
      setSelectedCampaign(camp);
      setStep('results');
    } catch (err) {
      setExecutionError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setExecuting(false);
    }
  };

  const resetWizard = () => {
    setStep('list');
    setSelectedBoardId(null);
    setStalledDays(14);
    setSelectedStageIds([]);
    setSelectedDealIds(new Set());
    setSearched(false);
    setCampaignName('');
    setMessage('');
    setSelectedChannelId(null);
    setExecutionError(null);
    setSelectedCampaign(null);
  };

  // ─── Renders ──────────────────────────────────────────────────────────────

  if (step === 'results' && selectedCampaign) {
    return (
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={resetWizard} className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-white transition-colors">← Campanhas</button>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white font-display">{selectedCampaign.name}</h1>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${selectedCampaign.status === 'completed' ? 'bg-green-100 text-green-600 dark:bg-green-500/20' : 'bg-amber-100 text-amber-600 dark:bg-amber-500/20'}`}>
            {selectedCampaign.status === 'completed' ? 'Concluída' : 'Em andamento'}
          </span>
        </div>
        <CampaignResultsView campaign={selectedCampaign} />
      </div>
    );
  }

  if (step === 'confirm') {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep('compose')} className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-white">← Voltar</button>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white font-display">Confirmar Envio</h1>
        </div>

        <div className="glass rounded-2xl border border-slate-200 dark:border-white/5 p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-indigo-50 dark:bg-indigo-500/10 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-indigo-500">{validDeals.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">Contatos</p>
            </div>
            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-4 text-center">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{campaignName || 'Sem nome'}</p>
              <p className="text-xs text-slate-500 mt-0.5">Campanha</p>
            </div>
            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-4 text-center">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                {channels.find((c) => c.id === selectedChannelId)?.name ?? '—'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Canal</p>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">Mensagem</p>
            <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{message}</p>
          </div>

          {executionError && (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-xl p-3 text-sm">
              <AlertCircle size={15} />
              {executionError}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep('compose')} className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              Voltar
            </button>
            <button
              onClick={handleExecute}
              disabled={executing}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
            >
              {executing ? <><RefreshCw size={15} className="animate-spin" /> Enviando...</> : <><Zap size={15} /> Disparar Campanha</>}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'compose') {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep('source')} className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-white">← Voltar</button>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white font-display">Compor Mensagem</h1>
        </div>

        <div className="glass rounded-2xl border border-slate-200 dark:border-white/5 p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Nome da campanha</label>
            <input
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder={`Reativação ${new Date().toLocaleDateString('pt-BR')}`}
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Canal WhatsApp</label>
            {channels.length === 0 ? (
              <p className="text-sm text-amber-600 dark:text-amber-400">Nenhum canal WhatsApp conectado.</p>
            ) : (
              <select
                value={selectedChannelId ?? ''}
                onChange={(e) => setSelectedChannelId(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Selecionar canal...</option>
                {channels.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.provider})</option>)}
              </select>
            )}
          </div>

          <div className="relative">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              Mensagem
              <span className="ml-1 font-normal text-slate-400">(/ para respostas rápidas)</span>
            </label>
            {quickReplies.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 mb-1 z-10">
                <QuickRepliesMenu
                  items={quickReplies}
                  activeIndex={qrActiveIndex}
                  onSelect={(reply) => { setMessage(reply.content); setQrActiveIndex(0); }}
                  onClose={() => setMessage((prev) => prev.startsWith('/') ? '' : prev)}
                />
              </div>
            )}
            <textarea
              value={message}
              onChange={(e) => { setMessage(e.target.value); setQrActiveIndex(0); }}
              onKeyDown={(e) => {
                if (quickReplies.length > 0) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setQrActiveIndex((i) => Math.min(i + 1, quickReplies.length - 1)); }
                  if (e.key === 'ArrowUp')   { e.preventDefault(); setQrActiveIndex((i) => Math.max(i - 1, 0)); }
                  if (e.key === 'Enter')     { e.preventDefault(); setMessage(quickReplies[qrActiveIndex].content); setQrActiveIndex(0); }
                  if (e.key === 'Escape')    { setMessage(''); }
                }
              }}
              rows={5}
              placeholder="Olá {{nome}}, vimos que seu projeto ainda está em aberto..."
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            <p className="mt-1 text-xs text-slate-400 text-right">{message.length} caracteres · {validDeals.length} destinatários</p>
          </div>

          <button
            onClick={() => setStep('confirm')}
            disabled={!message.trim() || !selectedChannelId || validDeals.length === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Revisar e Disparar
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    );
  }

  if (step === 'source') {
    const withWaCount = stalledDeals.filter((d) => d.hasWhatsApp).length;
    const allSelected = withWaCount > 0 && stalledDeals.filter((d) => d.hasWhatsApp).every((d) => selectedDealIds.has(d.dealId));

    return (
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep('list')} className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-white">← Campanhas</button>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white font-display">Selecionar Negócios</h1>
        </div>

        {/* Filtros */}
        <div className="glass rounded-2xl border border-slate-200 dark:border-white/5 p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Pipeline</label>
              <select
                value={selectedBoardId ?? ''}
                onChange={(e) => { setSelectedBoardId(e.target.value || null); setSelectedStageIds([]); setSearched(false); }}
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Selecionar pipeline...</option>
                {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                Parados há pelo menos
              </label>
              <select
                value={stalledDays}
                onChange={(e) => setStalledDays(Number(e.target.value))}
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {[3, 7, 14, 21, 30, 60, 90].map((d) => <option key={d} value={d}>{daysLabel(d)}</option>)}
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={handleSearch}
                disabled={!selectedBoardId || loadingDeals}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
              >
                {loadingDeals ? <RefreshCw size={15} className="animate-spin" /> : <Search size={15} />}
                Buscar Negócios
              </button>
            </div>
          </div>

          {/* Filtro por estágio */}
          {stages.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Filtrar por estágio (opcional)</p>
              <div className="flex flex-wrap gap-2">
                {stages.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStageIds((prev) =>
                      prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]
                    )}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                      selectedStageIds.includes(s.id)
                        ? 'text-white border-transparent'
                        : 'text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                    }`}
                    style={selectedStageIds.includes(s.id) ? { backgroundColor: s.color, borderColor: s.color } : {}}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tabela de negócios */}
        {searched && (
          <div className="glass rounded-2xl border border-slate-200 dark:border-white/5 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-white/5">
              <div className="flex items-center gap-3">
                <button onClick={toggleAll} className="text-slate-400 hover:text-indigo-500 transition-colors">
                  {allSelected ? <CheckSquare size={18} className="text-indigo-500" /> : <Square size={18} />}
                </button>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {stalledDeals.length} negócios encontrados
                  {withWaCount < stalledDeals.length && (
                    <span className="ml-1 text-slate-400 font-normal">({withWaCount} com WhatsApp)</span>
                  )}
                </span>
              </div>
              {selectedDealIds.size > 0 && (
                <span className="text-sm text-indigo-500 font-medium">{selectedDealIds.size} selecionado(s)</span>
              )}
            </div>

            {stalledDeals.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <Search size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhum negócio parado encontrado com esses filtros</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-white/5">
                      <th className="w-10 p-3"></th>
                      <th className="text-left p-3 font-medium text-slate-500">Contato</th>
                      <th className="text-left p-3 font-medium text-slate-500">Negócio</th>
                      <th className="text-left p-3 font-medium text-slate-500">Estágio</th>
                      <th className="text-left p-3 font-medium text-slate-500">Parado há</th>
                      <th className="text-left p-3 font-medium text-slate-500">WhatsApp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stalledDeals.map((deal) => (
                      <tr
                        key={deal.dealId}
                        onClick={() => deal.hasWhatsApp && toggleDeal(deal.dealId)}
                        className={`border-b border-slate-50 dark:border-white/[0.03] transition-colors ${
                          deal.hasWhatsApp
                            ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.02]'
                            : 'opacity-50 cursor-not-allowed'
                        } ${selectedDealIds.has(deal.dealId) ? 'bg-indigo-50 dark:bg-indigo-500/5' : ''}`}
                      >
                        <td className="p-3">
                          {deal.hasWhatsApp && (
                            selectedDealIds.has(deal.dealId)
                              ? <CheckSquare size={16} className="text-indigo-500" />
                              : <Square size={16} className="text-slate-300 dark:text-slate-600" />
                          )}
                        </td>
                        <td className="p-3 font-medium text-slate-700 dark:text-slate-200">{deal.contactName}</td>
                        <td className="p-3 text-slate-500 dark:text-slate-400 text-xs max-w-[180px] truncate">{deal.dealTitle}</td>
                        <td className="p-3">
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                            style={{ backgroundColor: deal.stageColor }}
                          >
                            {deal.stageName}
                          </span>
                        </td>
                        <td className="p-3 text-slate-500 text-xs">{daysLabel(deal.daysSinceUpdate)}</td>
                        <td className="p-3">
                          {deal.hasWhatsApp
                            ? <CheckCircle size={14} className="text-green-500" />
                            : <XCircle size={14} className="text-slate-300" />
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {selectedDealIds.size > 0 && (
          <div className="flex justify-end">
            <button
              onClick={() => setStep('compose')}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition-colors"
            >
              Compor Mensagem ({selectedDealIds.size})
              <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>
    );
  }

  // Step "list" — listagem de campanhas
  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-500/20 rounded-xl">
            <Megaphone className="text-indigo-500" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white font-display">Campanhas</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Disparos em massa e reativação de pipeline</p>
          </div>
        </div>
        <button
          onClick={() => setStep('source')}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition-colors"
        >
          <Zap size={15} />
          Nova Campanha
        </button>
      </div>

      {/* Lista de campanhas */}
      {campaigns.length === 0 ? (
        <div className="glass rounded-2xl border border-slate-200 dark:border-white/5 p-12 text-center">
          <Megaphone size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="font-medium text-slate-600 dark:text-slate-300 mb-1">Nenhuma campanha ainda</p>
          <p className="text-sm text-slate-400">Crie sua primeira campanha para reativar negócios parados no pipeline</p>
          <button
            onClick={() => setStep('source')}
            className="mt-4 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition-colors"
          >
            Criar campanha
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <div
              key={c.id}
              onClick={() => { setSelectedCampaign(c); setStep('results'); }}
              className="glass rounded-2xl border border-slate-200 dark:border-white/5 p-4 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-500/40 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-slate-900 dark:text-white text-sm">{c.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      c.status === 'completed' ? 'bg-green-100 text-green-600 dark:bg-green-500/20' :
                      c.status === 'running'   ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/20' :
                      'bg-slate-100 text-slate-500 dark:bg-slate-700'
                    }`}>
                      {c.status === 'completed' ? 'Concluída' : c.status === 'running' ? 'Em andamento' : 'Rascunho'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{c.message}</p>
                </div>
                <div className="flex items-center gap-4 ml-4 shrink-0">
                  <div className="text-center">
                    <p className="text-sm font-bold text-green-500">{c.sentCount}</p>
                    <p className="text-xs text-slate-400">Enviadas</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300">{c.totalCount}</p>
                    <p className="text-xs text-slate-400">Total</p>
                  </div>
                  <ChevronRight size={16} className="text-slate-400" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
