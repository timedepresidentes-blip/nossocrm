'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { MessageSquareDot, X, Send, Users, Paperclip, Smile, FileText, GripHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useInternalChat, useInternalChatRealtime, useSendInternalMessage } from '@/lib/query/hooks/useInternalChatQuery';
import { useNotificationSound, unlockAudio } from '@/lib/hooks/useNotificationSound';

const EmojiPicker = dynamic(() => import('emoji-picker-react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[300px] text-sm text-slate-400">Carregando emojis…</div>
  ),
});

const ATTACH_SEP = 'ATTACH|';
const SIZE_KEY = 'nossocrm-internal-chat-size';
const MIN_W = 360;
const MAX_W = 720;
const MIN_H = 400;
const MAX_H = 860;
const DEFAULT_W = 480;
const DEFAULT_H = 580;

function loadSize() {
  try {
    const raw = localStorage.getItem(SIZE_KEY);
    if (!raw) return { w: DEFAULT_W, h: DEFAULT_H };
    const { w, h } = JSON.parse(raw);
    return {
      w: Math.min(MAX_W, Math.max(MIN_W, w)),
      h: Math.min(MAX_H, Math.max(MIN_H, h)),
    };
  } catch {
    return { w: DEFAULT_W, h: DEFAULT_H };
  }
}

function saveSize(w: number, h: number) {
  try { localStorage.setItem(SIZE_KEY, JSON.stringify({ w, h })); } catch { /* ignore */ }
}

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
              isMe
                ? 'bg-white/20 hover:bg-white/30'
                : 'bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20'
            )}
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span className="truncate max-w-[220px]">{attach.name}</span>
          </a>
        )
      )}
      {text && <span className="text-sm break-words whitespace-pre-wrap leading-relaxed">{text}</span>}
    </div>
  );
}

// Leitura persistente do chat via localStorage — garante que fechar e reabrir o app
// não ressuscite o badge verde para mensagens já visualizadas.
function chatReadKey(orgId: string | undefined, userId: string | undefined) {
  return `nossocrm-chat-lastread-${orgId}-${userId}`;
}
function loadLastRead(orgId: string | undefined, userId: string | undefined): string {
  if (!orgId || !userId || typeof window === 'undefined') return new Date(0).toISOString();
  return localStorage.getItem(chatReadKey(orgId, userId)) ?? new Date(0).toISOString();
}
function saveLastRead(orgId: string | undefined, userId: string | undefined) {
  if (!orgId || !userId || typeof window === 'undefined') return;
  try { localStorage.setItem(chatReadKey(orgId, userId), new Date().toISOString()); } catch { /* ignore */ }
}

export function InternalChatPanel() {
  const { profile, organizationId } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [lastReadAt, setLastReadAt] = useState<string>(() =>
    loadLastRead(organizationId, profile?.id)
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [panelSize, setPanelSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });

  const bottomRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resizing = useRef(false);
  const resizeOrigin = useRef({ x: 0, y: 0, w: DEFAULT_W, h: DEFAULT_H });

  const { play } = useNotificationSound();
  const { data: messages = [], isLoading } = useInternalChat(organizationId);
  const send = useSendInternalMessage();
  useInternalChatRealtime(organizationId);

  // Carrega tamanho salvo
  useEffect(() => { setPanelSize(loadSize()); }, []);

  // lastReadAt sincronizado do localStorage ao montar (para casos de múltiplas abas)
  useEffect(() => {
    setLastReadAt(loadLastRead(organizationId, profile?.id));
  }, [organizationId, profile?.id]);

  // Unread derivado dos dados: mensagens de outros após o último timestamp de leitura
  const unread = React.useMemo(() => {
    if (!profile?.id) return 0;
    return messages.filter(m => m.senderId !== profile.id && m.createdAt > lastReadAt).length;
  }, [messages, profile?.id, lastReadAt]);

  // Detecta mensagens novas para tocar som
  const prevCountRef = useRef(-1);
  useEffect(() => {
    if (prevCountRef.current === -1) {
      prevCountRef.current = messages.length;
      return;
    }
    if (messages.length > prevCountRef.current) {
      const newest = messages[messages.length - 1];
      if (newest?.senderId !== profile?.id) {
        play('chat_interno');
      }
    }
    prevCountRef.current = messages.length;
  }, [messages.length, profile?.id, play]);

  useEffect(() => {
    if (open) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
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

  // Resize com mouse
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const dw = resizeOrigin.current.x - e.clientX; // arrastar para esquerda = mais largo
      const dh = e.clientY - resizeOrigin.current.y;  // arrastar para baixo = mais alto
      const w = Math.min(MAX_W, Math.max(MIN_W, resizeOrigin.current.w + dw));
      const h = Math.min(MAX_H, Math.max(MIN_H, resizeOrigin.current.h + dh));
      setPanelSize({ w, h });
    };
    const onUp = () => {
      if (!resizing.current) return;
      resizing.current = false;
      setPanelSize(prev => { saveSize(prev.w, prev.h); return prev; });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = true;
    resizeOrigin.current = { x: e.clientX, y: e.clientY, w: panelSize.w, h: panelSize.h };
  };

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
      const uploadRes = await fetch(signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!uploadRes.ok) throw new Error('Falha no upload do arquivo');
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

  return (
    <div className="relative" ref={panelRef}>
      {/* Botão */}
      <button
        type="button"
        onClick={() => {
          unlockAudio();
          setOpen(o => {
            if (!o) {
              // Abrindo painel: marca todas como lidas persistindo no localStorage
              saveLastRead(organizationId, profile?.id);
              setLastReadAt(new Date().toISOString());
            }
            return !o;
          });
          setShowEmoji(false);
        }}
        className={cn(
          'relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 active:scale-95 select-none tracking-wide',
          unread > 0
            ? 'text-white bg-green-500 hover:bg-green-600 shadow-lg shadow-green-500/50'
            : open
              ? 'text-yellow-900 bg-yellow-500 shadow-md shadow-yellow-500/40'
              : 'text-yellow-900 bg-yellow-400 hover:bg-yellow-500 shadow-md shadow-yellow-400/30'
        )}
        title="Chat da equipe"
        aria-label="Chat interno da equipe"
      >
        {/* Anel pulsante quando há mensagens novas */}
        {unread > 0 && !open && (
          <span className="absolute inset-0 rounded-xl animate-ping bg-green-400 opacity-50 pointer-events-none" />
        )}

        <MessageSquareDot size={20} aria-hidden="true" />
        <span>CHAT</span>

        {unread > 0 && !open && (
          <span className="flex items-center justify-center min-w-[22px] h-[22px] px-1 rounded-full bg-red-600 text-white text-[11px] font-black leading-none shadow-md">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Painel */}
      {open && (
        <div
          className="absolute right-0 top-14 z-50 flex flex-col rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 overflow-hidden"
          style={{ width: panelSize.w, height: panelSize.h }}
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

          {/* Alça de redimensionamento (canto inferior esquerdo) */}
          <div
            onMouseDown={handleResizeMouseDown}
            className="absolute bottom-0 left-0 w-6 h-6 flex items-end justify-start p-1 cursor-sw-resize text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400 transition-colors select-none"
            title="Arrastar para redimensionar"
          >
            <GripHorizontal className="w-3.5 h-3.5 rotate-45" />
          </div>
        </div>
      )}
    </div>
  );
}
