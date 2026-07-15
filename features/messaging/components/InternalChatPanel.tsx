'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { MessageSquareDot, X, Send, Users, Paperclip, Smile, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useInternalChat, useInternalChatRealtime, useSendInternalMessage } from '@/lib/query/hooks/useInternalChatQuery';
import { useNotificationSound, unlockAudio } from '@/lib/hooks/useNotificationSound';

// Lazy load: emoji picker é pesado (~1MB)
const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false, loading: () => (
  <div className="flex items-center justify-center h-[300px] text-sm text-slate-400">Carregando emojis…</div>
)});

// Formato de anexo no campo content: "ATTACH|mime|nome|url\ntexto opcional"
const ATTACH_SEP = 'ATTACH|';

function parseContent(content: string) {
  if (!content.startsWith(ATTACH_SEP)) return { text: content, attach: null };
  const rest = content.slice(ATTACH_SEP.length);
  const nl = rest.indexOf('\n');
  const meta = nl >= 0 ? rest.slice(0, nl) : rest;
  const text = nl >= 0 ? rest.slice(nl + 1) : '';
  const [mime, name, url] = meta.split('|');
  return { text, attach: { mime, name, url } };
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function Avatar({ name, url, size = 8 }: { name: string; url?: string | null; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  if (url) return <img src={url} alt={name} className={`w-${size} h-${size} rounded-full object-cover shrink-0`} />;
  return (
    <div className={`w-${size} h-${size} rounded-full bg-primary-500 flex items-center justify-center text-white text-xs font-semibold shrink-0`}>
      {initials}
    </div>
  );
}

function MessageContent({ content, isMe }: { content: string; isMe: boolean }) {
  const { text, attach } = parseContent(content);
  return (
    <div className="flex flex-col gap-1.5">
      {attach && (
        attach.mime?.startsWith('image/') ? (
          <a href={attach.url} target="_blank" rel="noreferrer" className="block">
            <img src={attach.url} alt={attach.name} className="max-w-full rounded-xl max-h-52 object-cover" />
          </a>
        ) : (
          <a
            href={attach.url}
            target="_blank"
            rel="noreferrer"
            className={cn(
              'flex items-center gap-2 rounded-xl px-3 py-2 text-xs transition-colors',
              isMe ? 'bg-white/20 hover:bg-white/30' : 'bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20'
            )}
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span className="truncate max-w-[200px]">{attach.name}</span>
          </a>
        )
      )}
      {text && <span className="text-sm break-words whitespace-pre-wrap leading-relaxed">{text}</span>}
    </div>
  );
}

export function InternalChatPanel() {
  const { profile, organizationId } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [unread, setUnread] = useState(0);
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { play } = useNotificationSound();

  const { data: messages = [], isLoading } = useInternalChat(organizationId);
  const send = useSendInternalMessage();

  useInternalChatRealtime(organizationId);

  // Detecta mensagens novas
  const prevCountRef = useRef(-1);
  useEffect(() => {
    if (prevCountRef.current === -1) {
      prevCountRef.current = messages.length;
      return;
    }
    if (messages.length > prevCountRef.current) {
      const added = messages.length - prevCountRef.current;
      const newest = messages[messages.length - 1];
      if (newest?.senderId !== profile?.id) {
        play('chat_interno');
        if (!open) setUnread(u => u + added);
      }
    }
    prevCountRef.current = messages.length;
  }, [messages.length, open, profile?.id, play]);

  // Rola para o fim ao abrir ou nova mensagem
  useEffect(() => {
    if (open) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      setUnread(0);
    }
  }, [open, messages.length]);

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowEmoji(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setShowEmoji(false);
    setUploadError('');
    play('mensagem_enviada');
    send.mutate(text);
  }, [input, send, play]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !organizationId) return;
    e.target.value = '';
    setUploading(true);
    setUploadError('');

    try {
      // 1. Solicita URL assinada ao servidor
      const res = await fetch('/api/internal-chat/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, fileSize: file.size, orgId: organizationId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao preparar upload');
      }
      const { signedUrl, publicUrl } = await res.json();

      // 2. Faz upload direto para o Supabase Storage
      const uploadRes = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error('Falha no upload do arquivo');

      // 3. Envia mensagem com anexo
      const text = input.trim();
      const content = `${ATTACH_SEP}${file.type}|${file.name}|${publicUrl}${text ? `\n${text}` : ''}`;
      setInput('');
      play('mensagem_enviada');
      send.mutate(content);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Erro ao enviar arquivo');
    } finally {
      setUploading(false);
    }
  }, [organizationId, input, send, play]);

  const handleOpen = () => {
    unlockAudio();
    setOpen(o => !o);
    setShowEmoji(false);
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Botão no header */}
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          'relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-95 select-none',
          open
            ? 'text-primary-600 bg-primary-100 dark:text-primary-400 dark:bg-primary-900/30'
            : unread > 0
              ? 'text-white bg-primary-500 hover:bg-primary-600 shadow-md shadow-primary-500/40 dark:shadow-primary-500/20'
              : 'text-slate-600 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:bg-white/10 dark:hover:bg-white/15'
        )}
        title="Chat da equipe"
        aria-label="Chat interno da equipe"
      >
        {unread > 0 && !open && (
          <span className="absolute inset-0 rounded-xl animate-ping bg-primary-400 opacity-30 pointer-events-none" />
        )}
        <MessageSquareDot size={18} aria-hidden="true" />
        <span>Equipe</span>
        {unread > 0 && !open && (
          <span className="flex items-center justify-center min-w-[20px] h-[20px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none shadow">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Painel dropdown */}
      {open && (
        <div
          className="absolute right-0 top-14 z-50 flex flex-col rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 overflow-hidden"
          style={{ width: 460, height: 580 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-primary-600 text-white shrink-0">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              <span className="font-semibold">Chat da Equipe</span>
            </div>
            <button
              onClick={() => { setOpen(false); setShowEmoji(false); }}
              className="p-1 rounded hover:bg-white/20 transition-colors"
              aria-label="Fechar chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {isLoading && <p className="text-xs text-center text-slate-400 mt-10">Carregando…</p>}
            {!isLoading && messages.length === 0 && (
              <p className="text-xs text-center text-slate-400 mt-12">
                Nenhuma mensagem ainda.<br />Seja o primeiro a escrever!
              </p>
            )}
            {messages.map((msg) => {
              const isMe = msg.senderId === profile?.id;
              return (
                <div key={msg.id} className={cn('flex gap-2.5', isMe && 'flex-row-reverse')}>
                  {!isMe && <Avatar name={msg.senderName} url={msg.senderAvatar} size={8} />}
                  <div className={cn('max-w-[78%] flex flex-col gap-0.5', isMe && 'items-end')}>
                    {!isMe && (
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 px-1">
                        {msg.senderName}
                      </span>
                    )}
                    <div className={cn(
                      'px-3 py-2 rounded-2xl break-words',
                      isMe
                        ? 'bg-primary-500 text-white rounded-tr-sm'
                        : 'bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-white rounded-tl-sm'
                    )}>
                      <MessageContent content={msg.content} isMe={isMe} />
                    </div>
                    <span className="text-[10px] text-slate-400 px-1">{formatTime(msg.createdAt)}</span>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Emoji Picker */}
          {showEmoji && (
            <div className="shrink-0 border-t border-slate-200 dark:border-white/10">
              <EmojiPicker
                onEmojiClick={(data) => {
                  setInput(prev => prev + data.emoji);
                  textareaRef.current?.focus();
                }}
                width="100%"
                height={300}
              />
            </div>
          )}

          {/* Erro de upload */}
          {uploadError && (
            <div className="shrink-0 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs text-center">
              {uploadError}
            </div>
          )}

          {/* Input */}
          <div className="shrink-0 border-t border-slate-200 dark:border-white/10 px-3 py-2.5 flex gap-1.5 items-end">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
              onChange={handleFile}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="p-2 rounded-lg text-slate-400 hover:text-primary-500 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors shrink-0 disabled:opacity-40"
              title="Anexar arquivo (máx. 10MB)"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowEmoji(v => !v)}
              className={cn(
                'p-2 rounded-lg transition-colors shrink-0',
                showEmoji
                  ? 'text-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'text-slate-400 hover:text-primary-500 hover:bg-slate-100 dark:hover:bg-white/10'
              )}
              title="Emojis"
            >
              <Smile className="w-4 h-4" />
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={uploading ? 'Enviando arquivo…' : 'Mensagem… (Enter envia)'}
              disabled={uploading}
              rows={1}
              className="flex-1 resize-none text-sm bg-slate-100 dark:bg-white/5 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white placeholder-slate-400 max-h-24 disabled:opacity-60"
              style={{ minHeight: 38 }}
            />

            <button
              onClick={handleSend}
              disabled={!input.trim() || send.isPending || uploading}
              className="p-2.5 rounded-xl bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-40 transition-colors shrink-0"
              aria-label="Enviar mensagem"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
