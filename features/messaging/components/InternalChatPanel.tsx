'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquareDot, X, Send, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useInternalChat, useInternalChatRealtime, useSendInternalMessage } from '@/lib/query/hooks/useInternalChatQuery';
import { useNotificationSound } from '@/lib/hooks/useNotificationSound';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function Avatar({ name, url, size = 7 }: { name: string; url?: string | null; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  if (url) return <img src={url} alt={name} className={`w-${size} h-${size} rounded-full object-cover shrink-0`} />;
  return (
    <div className={`w-${size} h-${size} rounded-full bg-primary-500 flex items-center justify-center text-white text-xs font-semibold shrink-0`}>
      {initials}
    </div>
  );
}

export function InternalChatPanel() {
  const { profile, organizationId } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { play } = useNotificationSound();

  const { data: messages = [], isLoading } = useInternalChat(organizationId);
  const send = useSendInternalMessage();

  // Realtime — conta não lidos quando painel fechado
  const prevCountRef = useRef(messages.length);
  useInternalChatRealtime(organizationId);

  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      const newest = messages[messages.length - 1];
      // Só notifica mensagens de outros atendentes
      if (newest?.senderId !== profile?.id) {
        play('chat_interno');
        if (!open) setUnread(u => u + (messages.length - prevCountRef.current));
      }
    }
    prevCountRef.current = messages.length;
  }, [messages.length, open, profile?.id, play]);

  // Rola para o fim ao abrir ou receber mensagem
  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      setUnread(0);
    }
  }, [open, messages.length]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    send.mutate(text);
  }, [input, send]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <>
      {/* Painel */}
      {open && (
        <div className="fixed bottom-20 right-4 z-50 w-80 flex flex-col rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 overflow-hidden"
          style={{ height: 420 }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-primary-600 text-white shrink-0">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span className="text-sm font-semibold">Chat da Equipe</span>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-white/20 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {isLoading && (
              <p className="text-xs text-center text-slate-400">Carregando…</p>
            )}
            {!isLoading && messages.length === 0 && (
              <p className="text-xs text-center text-slate-400 mt-8">Nenhuma mensagem ainda.<br />Seja o primeiro a escrever!</p>
            )}
            {messages.map((msg) => {
              const isMe = msg.senderId === profile?.id;
              return (
                <div key={msg.id} className={cn('flex gap-2', isMe && 'flex-row-reverse')}>
                  {!isMe && <Avatar name={msg.senderName} url={msg.senderAvatar} size={7} />}
                  <div className={cn('max-w-[75%] flex flex-col gap-0.5', isMe && 'items-end')}>
                    {!isMe && (
                      <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 px-1">
                        {msg.senderName}
                      </span>
                    )}
                    <div className={cn(
                      'px-3 py-2 rounded-2xl text-sm break-words',
                      isMe
                        ? 'bg-primary-500 text-white rounded-tr-sm'
                        : 'bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-white rounded-tl-sm'
                    )}>
                      {msg.content}
                    </div>
                    <span className="text-[10px] text-slate-400 px-1">{formatTime(msg.createdAt)}</span>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-slate-200 dark:border-white/10 px-3 py-2 flex gap-2 items-end">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Mensagem para a equipe…"
              rows={1}
              className="flex-1 resize-none text-sm bg-slate-100 dark:bg-white/5 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white placeholder-slate-400 max-h-20"
              style={{ minHeight: 36 }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || send.isPending}
              className="p-2 rounded-xl bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-40 transition-colors shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Botão flutuante */}
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'fixed bottom-4 right-4 z-50 w-13 h-13 rounded-full shadow-lg flex items-center justify-center transition-all',
          open
            ? 'bg-slate-600 text-white'
            : 'bg-primary-600 text-white hover:bg-primary-700'
        )}
        style={{ width: 52, height: 52 }}
        title="Chat da equipe"
      >
        <MessageSquareDot className="w-6 h-6" />
        {unread > 0 && !open && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </>
  );
}
