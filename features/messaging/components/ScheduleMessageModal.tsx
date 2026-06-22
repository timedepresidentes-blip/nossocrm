'use client';

import React, { useState, useRef } from 'react';
import { X, Clock, Send, CalendarClock, AlertCircle } from 'lucide-react';
import { useCreateScheduledMessage } from '@/lib/query/hooks/useScheduledMessagesQuery';
import { useQuickReplies, type QuickReply } from '@/lib/query/hooks/useQuickRepliesQuery';
import { QuickRepliesMenu } from './QuickRepliesMenu';

interface ScheduleMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  channelId: string;
  externalContactId: string;
  contactName?: string;
  initialMessage?: string;
}

// Formata Date como string local para input datetime-local (sem conversão UTC)
function toLocalISOString(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Retorna o datetime-local mínimo (agora + 2 minutos) em horário local
function minDatetime(): string {
  const d = new Date(Date.now() + 2 * 60 * 1000);
  d.setSeconds(0, 0);
  return toLocalISOString(d);
}

// Retorna sugestão (próximo horário cheio) em horário local
function suggestDatetime(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return toLocalISOString(d);
}

export function ScheduleMessageModal({
  isOpen,
  onClose,
  conversationId,
  channelId,
  externalContactId,
  contactName,
  initialMessage = '',
}: ScheduleMessageModalProps) {
  const [message, setMessage] = useState(initialMessage);
  const [scheduledAt, setScheduledAt] = useState(suggestDatetime);
  const [qrActiveIndex, setQrActiveIndex] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { data: allQuickReplies = [] } = useQuickReplies();
  const createMutation = useCreateScheduledMessage();

  // Reset quando abre
  React.useEffect(() => {
    if (isOpen) {
      setMessage(initialMessage);
      setScheduledAt(suggestDatetime());
      setQrActiveIndex(0);
      setSubmitError(null);
    }
  }, [isOpen, initialMessage]);

  const qrQuery = message.startsWith('/') ? message.slice(1).toLowerCase() : null;
  const quickReplies = qrQuery !== null
    ? allQuickReplies.filter(
        (r) => r.shortcut.startsWith(qrQuery) || r.title.toLowerCase().includes(qrQuery)
      )
    : [];

  const applyQuickReply = (reply: QuickReply) => {
    setMessage(reply.content);
    setQrActiveIndex(0);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (quickReplies.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setQrActiveIndex((i) => Math.min(i + 1, quickReplies.length - 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setQrActiveIndex((i) => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter')     { e.preventDefault(); applyQuickReply(quickReplies[qrActiveIndex]); return; }
      if (e.key === 'Escape')    { setMessage(''); return; }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !scheduledAt) return;
    setSubmitError(null);

    try {
      await createMutation.mutateAsync({
        conversationId,
        channelId,
        externalContactId,
        contactName,
        message: message.trim(),
        scheduledAt: new Date(scheduledAt).toISOString(),
      });
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Erro ao agendar mensagem. Tente novamente.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 animate-in zoom-in-95 fade-in duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-indigo-100 dark:bg-indigo-500/20 rounded-lg">
              <CalendarClock className="text-indigo-500" size={18} />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white text-sm">
                Agendar Mensagem
              </h2>
              {contactName && (
                <p className="text-xs text-slate-400">para {contactName}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Data e Hora */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1">
              <Clock size={12} />
              Enviar em
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              min={minDatetime()}
              required
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Mensagem */}
          <div className="relative">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              Mensagem
              <span className="ml-1 font-normal text-slate-400">(digite / para usar respostas rápidas)</span>
            </label>

            {quickReplies.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 mb-1 z-10">
                <QuickRepliesMenu
                  items={quickReplies}
                  activeIndex={qrActiveIndex}
                  onSelect={applyQuickReply}
                  onClose={() => setMessage('')}
                />
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => { setMessage(e.target.value); setQrActiveIndex(0); }}
              onKeyDown={handleKeyDown}
              rows={4}
              placeholder="Digite a mensagem ou use / para respostas rápidas..."
              required
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            <p className="mt-1 text-xs text-slate-400 text-right">{message.length} caracteres</p>
          </div>

          {/* Erro de envio */}
          {submitError && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl text-sm text-red-600 dark:text-red-400">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!message.trim() || !scheduledAt || createMutation.isPending}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CalendarClock size={15} />
              {createMutation.isPending ? 'Agendando...' : 'Agendar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
