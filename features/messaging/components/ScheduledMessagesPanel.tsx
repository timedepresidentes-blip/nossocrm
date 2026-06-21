'use client';

import React, { useState } from 'react';
import { CalendarClock, X, Clock, CheckCircle, XCircle, AlertCircle, Filter } from 'lucide-react';
import {
  useScheduledMessagesQuery,
  useCancelScheduledMessage,
  type ScheduledMessage,
} from '@/lib/query/hooks/useScheduledMessagesQuery';

const STATUS_CONFIG = {
  pending:   { label: 'Agendada',  icon: Clock,         color: 'text-indigo-500 bg-indigo-100 dark:bg-indigo-500/20' },
  sent:      { label: 'Enviada',   icon: CheckCircle,   color: 'text-green-500 bg-green-100 dark:bg-green-500/20' },
  failed:    { label: 'Falhou',    icon: AlertCircle,   color: 'text-red-500 bg-red-100 dark:bg-red-500/20' },
  cancelled: { label: 'Cancelada', icon: XCircle,       color: 'text-slate-500 bg-slate-100 dark:bg-slate-500/20' },
};

function formatDatetime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function MessageRow({ msg }: { msg: ScheduledMessage }) {
  const cancelMutation = useCancelScheduledMessage();
  const cfg = STATUS_CONFIG[msg.status];
  const Icon = cfg.icon;

  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-100 dark:border-white/5 last:border-0">
      <div className={`p-1.5 rounded-lg shrink-0 ${cfg.color}`}>
        <Icon size={13} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-0.5 flex items-center gap-1">
          <Clock size={10} />
          {formatDatetime(msg.scheduledAt)}
          {msg.contactName && <> · {msg.contactName}</>}
        </p>
        <p className="text-sm text-slate-700 dark:text-slate-200 line-clamp-2">{msg.message}</p>
        {msg.errorMessage && (
          <p className="text-xs text-red-500 mt-0.5">{msg.errorMessage}</p>
        )}
      </div>
      {msg.status === 'pending' && (
        <button
          onClick={() => cancelMutation.mutate(msg.id)}
          disabled={cancelMutation.isPending}
          className="shrink-0 p-1 text-slate-400 hover:text-red-500 transition-colors"
          title="Cancelar agendamento"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

type StatusFilter = 'all' | 'pending' | 'sent' | 'failed' | 'cancelled';

interface ScheduledMessagesPanelProps {
  conversationId?: string;
  onClose: () => void;
}

export function ScheduledMessagesPanel({ conversationId, onClose }: ScheduledMessagesPanelProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const { data: messages = [], isLoading } = useScheduledMessagesQuery(conversationId);

  const filtered = statusFilter === 'all'
    ? messages
    : messages.filter((m) => m.status === statusFilter);

  const pendingCount = messages.filter((m) => m.status === 'pending').length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <CalendarClock size={16} className="text-indigo-500" />
          <span className="font-semibold text-sm text-slate-900 dark:text-white">
            Mensagens Agendadas
          </span>
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-bold bg-indigo-500 text-white rounded-full">
              {pendingCount}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white"
        >
          <X size={16} />
        </button>
      </div>

      {/* Filtro de status */}
      <div className="flex gap-1 p-3 shrink-0 border-b border-slate-100 dark:border-white/5 overflow-x-auto">
        {(['all', 'pending', 'sent', 'failed', 'cancelled'] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'bg-indigo-500 text-white'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            {s === 'all' ? 'Todas' : STATUS_CONFIG[s].label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto px-4">
        {isLoading ? (
          <div className="py-8 text-center text-sm text-slate-400">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center">
            <CalendarClock size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
            <p className="text-sm text-slate-400">Nenhuma mensagem agendada</p>
          </div>
        ) : (
          filtered.map((msg) => <MessageRow key={msg.id} msg={msg} />)
        )}
      </div>
    </div>
  );
}
