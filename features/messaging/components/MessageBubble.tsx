'use client';

import React, { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { Check, CheckCheck, Clock, AlertCircle, FileText, MapPin, Play, Pause, Image, Reply, Trash2, RotateCcw, Pencil, LayoutTemplate, X, ZoomIn } from 'lucide-react';
import { cn } from '@/lib/utils';
import { sanitizeUrl } from '@/lib/utils/sanitize';
import { useSendMessage, useDeleteMessage, useRetryMessage, useEditMessage } from '@/lib/query/hooks/useMessagingMessagesQuery';
import type {
  MessagingMessage,
  MessageStatus,
  TextContent,
  ImageContent,
  AudioContent,
  DocumentContent,
  LocationContent,
  ReactionContent,
} from '@/lib/messaging/types';

const QUICK_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🙏'] as const;

// Tradução amigável dos erros mais comuns da Meta WhatsApp API
const META_ERROR_MAP: Record<string, string> = {
  '131049': 'O WhatsApp bloqueou a entrega para este contato (proteção anti-spam). O contato precisa enviar uma mensagem primeiro para desbloquear.',
  '131000': 'Parâmetros inválidos na requisição ao WhatsApp.',
  '132000': 'Número de variáveis não corresponde ao template.',
  '132005': 'Template não encontrado ou idioma inválido.',
  '131021': 'Número de telefone inválido ou não registrado no WhatsApp.',
  '131026': 'Mensagem não entregue — o contato não aceitou os Termos do WhatsApp.',
  '130472': 'Número máximo de templates de marketing atingido para este contato hoje.',
};

function describeFailure(errorCode?: string, errorMessage?: string): string {
  if (errorCode && META_ERROR_MAP[errorCode]) return META_ERROR_MAP[errorCode];
  return errorMessage || 'Não foi possível entregar.';
}

function hexToRgba(hex: string, alpha: number): string {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return '';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---------------------------------------------------------------------------
// Media URL helpers
// ---------------------------------------------------------------------------

/**
 * Converte uma mediaUrl para uma URL reproduzível no browser.
 * URLs com prefixo "meta:" são IDs de mídia do Meta Cloud API e precisam
 * passar pelo proxy /api/messaging/media que faz a autenticação com o Meta.
 */
function resolveMediaUrl(url: string | null | undefined, conversationId: string): string {
  if (!url) return '';
  if (url.startsWith('meta:')) {
    const mediaId = url.slice(5);
    return `/api/messaging/media?id=${encodeURIComponent(mediaId)}&conversationId=${encodeURIComponent(conversationId)}`;
  }
  return sanitizeUrl(url);
}

// ---------------------------------------------------------------------------
// Audio player helpers
// ---------------------------------------------------------------------------

/** Deterministic waveform heights from a seed string (consistent per message). */
function generateWaveform(seed: string, count = 32): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return Array.from({ length: count }, (_, i) => {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
    h ^= i * 2654435761;
    return 18 + (Math.abs(h) % 72); // 18–90 %
  });
}

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// WhatsApp-style audio player
// ---------------------------------------------------------------------------

const SPEED_STEPS = [1, 1.5, 2] as const;
type SpeedStep = typeof SPEED_STEPS[number];

const AudioPlayer = memo(function AudioPlayer({
  content,
  isOutbound,
  conversationId,
}: {
  content: AudioContent;
  isOutbound: boolean;
  conversationId: string;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(content.duration ?? 0);
  const [loadError, setLoadError] = useState(false);
  const [speed, setSpeed] = useState<SpeedStep>(1);
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const safeUrl = resolveMediaUrl(content.mediaUrl, conversationId);

  // 24 bars — wide enough to look like waveform, not too thin
  const bars = useMemo(() => generateWaveform(content.mediaUrl ?? '', 24), [content.mediaUrl]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };
    const onTimeUpdate = () => setCurrentTime(el.currentTime);
    const onMeta = () => { if (Number.isFinite(el.duration)) setDuration(el.duration); };
    const onError = () => { setLoadError(true); setIsPlaying(false); };
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('error', onError);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('error', onError);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el || !safeUrl) return;
    setLoadError(false);
    if (isPlaying) {
      el.pause();
    } else {
      el.playbackRate = speed;
      el.play().catch(() => setLoadError(true));
    }
  }, [isPlaying, safeUrl, speed]);

  const cycleSpeed = useCallback(() => {
    const next = SPEED_STEPS[(SPEED_STEPS.indexOf(speed) + 1) % SPEED_STEPS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }, [speed]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    const bar = waveformRef.current;
    if (!el || !bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration;
    el.currentTime = t;
    setCurrentTime(t);
  }, [duration]);

  const progress = duration > 0 ? currentTime / duration : 0;

  if (loadError) {
    return (
      <div className={cn(
        'flex items-center gap-2 text-xs px-1',
        isOutbound ? 'text-white/60' : 'text-slate-400',
      )}>
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        <span>Áudio indisponível</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 select-none" style={{ minWidth: 200 }}>
      {safeUrl && <audio ref={audioRef} src={safeUrl} preload="metadata" />}

      {/* Play / Pause button */}
      <button
        type="button"
        onClick={togglePlay}
        disabled={!safeUrl}
        aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
        className={cn(
          'flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors',
          isOutbound
            ? 'bg-white/25 hover:bg-white/40 text-white'
            : 'bg-slate-700 hover:bg-slate-600 dark:bg-slate-200 dark:hover:bg-white text-white dark:text-slate-900',
          !safeUrl && 'opacity-40 cursor-not-allowed',
        )}
      >
        {isPlaying
          ? <Pause className="w-4 h-4 fill-current" />
          : <Play className="w-4 h-4 fill-current translate-x-px" />}
      </button>

      {/* Waveform */}
      <div
        ref={waveformRef}
        onClick={handleSeek}
        className="flex items-center gap-[3px] cursor-pointer"
        style={{ height: 32, flex: 1 }}
        role="slider"
        aria-label="Posição do áudio"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {bars.map((pct, i) => {
          const active = (i / bars.length) < progress;
          return (
            <div
              key={i}
              className={cn(
                'w-[3px] rounded-full transition-colors duration-75',
                active
                  ? isOutbound ? 'bg-white' : 'bg-slate-700 dark:bg-slate-200'
                  : isOutbound ? 'bg-white/35' : 'bg-slate-300 dark:bg-slate-600',
              )}
              style={{ height: `${pct}%` }}
            />
          );
        })}
      </div>

      {/* Duration */}
      <span
        className={cn(
          'flex-shrink-0 text-[11px] font-mono tabular-nums w-8 text-right',
          isOutbound ? 'text-white/70' : 'text-slate-500 dark:text-slate-400',
        )}
      >
        {formatAudioTime(isPlaying ? currentTime : duration)}
      </span>

      {/* Playback speed */}
      <button
        type="button"
        onClick={cycleSpeed}
        aria-label={`Velocidade de reprodução: ${speed}x`}
        className={cn(
          'flex-shrink-0 text-[11px] font-bold w-8 text-center rounded transition-colors',
          isOutbound
            ? 'text-white/80 hover:text-white hover:bg-white/20'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10',
          speed !== 1 && (isOutbound ? 'text-white bg-white/20' : 'text-primary-600 dark:text-primary-400'),
        )}
      >
        {speed}x
      </button>
    </div>
  );
});

interface MessageBubbleProps {
  message: MessagingMessage;
  conversationId: string;
  allMessages?: MessagingMessage[];
  onReply?: (message: MessagingMessage) => void;
  /** Cor hex da primeira etiqueta do contato — tinta as bolhas inbound */
  labelColor?: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// StatusIcon — exibido APENAS em bolhas outbound (fundo azul primary-500).
// Escala de progressão: relógio apagado → tick branco → 2 ticks verdes → lido verde-claro.
const StatusIcon = memo(function StatusIcon({ status }: { status: MessageStatus }) {
  switch (status) {
    case 'pending':
    case 'queued':
      return <Clock className="w-3 h-3 text-white/40" />;
    case 'sent':
      return <Check className="w-3 h-3 text-white/70" />;
    case 'delivered':
      // Verde escuro — claramente visível sobre azul, indica entrega confirmada
      return <CheckCheck className="w-3 h-3 text-emerald-300" />;
    case 'read':
      // Verde mais claro e brilhante — lida
      return <CheckCheck className="w-3 h-3 text-green-200" />;
    case 'failed':
      return <AlertCircle className="w-3 h-3 text-red-300" />;
    default:
      return null;
  }
});

const MessageContent = memo(function MessageContent({
  message,
  conversationId,
}: {
  message: MessagingMessage;
  conversationId: string;
}) {
  const { content, contentType } = message;
  const isOutbound = message.direction === 'outbound';

  switch (contentType) {
    case 'text': {
      const textContent = content as TextContent;
      return <p className="whitespace-pre-wrap break-words">{textContent.text}</p>;
    }

    case 'image': {
      const imageContent = content as ImageContent;
      const resolvedImageUrl = resolveMediaUrl(imageContent.mediaUrl, conversationId);
      return <ImageBubble url={resolvedImageUrl} caption={imageContent.caption} />;
    }

    case 'document': {
      const docContent = content as DocumentContent;
      const safeDocUrl = resolveMediaUrl(docContent.mediaUrl, conversationId);
      return safeDocUrl ? (
        <a
          href={safeDocUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 p-2 bg-black/5 dark:bg-white/5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
        >
          <FileText className="w-8 h-8 text-primary-500" />
          <div className="min-w-0">
            <p className="font-medium truncate">{docContent.fileName}</p>
            {docContent.fileSize && (
              <p className="text-xs opacity-70">{(docContent.fileSize / 1024).toFixed(1)} KB</p>
            )}
          </div>
        </a>
      ) : null;
    }

    case 'location': {
      const locContent = content as LocationContent;
      return (
        <a
          href={`https://maps.google.com/?q=${locContent.latitude},${locContent.longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 p-2 bg-black/5 dark:bg-white/5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
        >
          <MapPin className="w-6 h-6 text-red-500" />
          <div>
            {locContent.name && <p className="font-medium">{locContent.name}</p>}
            {locContent.address && <p className="text-xs opacity-70">{locContent.address}</p>}
          </div>
        </a>
      );
    }

    case 'audio': {
      const audioContent = content as AudioContent;
      return <AudioPlayer content={audioContent} isOutbound={isOutbound} conversationId={conversationId} />;
    }

    case 'video': {
      const videoContent = content as { mediaUrl?: string; caption?: string };
      const resolvedVideoUrl = resolveMediaUrl(videoContent.mediaUrl, conversationId);
      return (
        <div className="space-y-1">
          {resolvedVideoUrl ? (
            <video
              src={resolvedVideoUrl}
              controls
              playsInline
              className="max-w-[280px] rounded-lg"
              preload="metadata"
            />
          ) : (
            <div className="flex items-center gap-2 p-2 bg-black/5 dark:bg-white/5 rounded-lg">
              <Image className="w-5 h-5" />
              <span>Vídeo</span>
            </div>
          )}
          {videoContent.caption && (
            <p className="whitespace-pre-wrap break-words">{videoContent.caption}</p>
          )}
        </div>
      );
    }

    case 'sticker': {
      const stickerUrl = resolveMediaUrl((content as { mediaUrl?: string }).mediaUrl, conversationId);
      return (
        <div className="text-4xl">
          {stickerUrl ? (
            <img src={stickerUrl} alt="Sticker" className="w-24 h-24" />
          ) : (
            '🏷️'
          )}
        </div>
      );
    }

    case 'template': {
      const tpl = content as {
        templateName?: string;
        templateCategory?: string;
        parameters?: { body?: { text: string; type: string }[] };
        renderedText?: string;
      };
      const name = (tpl.templateName ?? '').replace(/_/g, ' ');
      const params = tpl.parameters?.body?.map((p) => p.text) ?? [];
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 opacity-60 text-xs">
            <LayoutTemplate className="w-3.5 h-3.5" />
            <span>Template · {name}</span>
          </div>
          {tpl.renderedText ? (
            <p className="whitespace-pre-wrap break-words">{tpl.renderedText}</p>
          ) : params.length > 0 ? (
            <p className="whitespace-pre-wrap break-words opacity-80 text-sm">
              {params.join(' · ')}
            </p>
          ) : null}
        </div>
      );
    }

    default:
      return <p className="italic opacity-70">[Tipo de mensagem não suportado]</p>;
  }
});

/** Reaction pills shown below the bubble */
const ReactionPills = memo(function ReactionPills({
  reactions,
  onReact,
}: {
  reactions: Record<string, number>;
  onReact: (emoji: string) => void;
}) {
  const entries = Object.entries(reactions).filter(([, count]) => count > 0);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {entries.map(([emoji, count]) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onReact(emoji)}
          className={cn(
            'flex items-center gap-0.5 px-2 py-0.5 rounded-full text-sm',
            'bg-white dark:bg-slate-800 shadow-sm',
            'border border-slate-200 dark:border-slate-700',
            'hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors',
          )}
          aria-label={`${emoji} ${count}`}
        >
          <span>{emoji}</span>
          {count > 1 && (
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{count}</span>
          )}
        </button>
      ))}
    </div>
  );
});

/**
 * Emoji quick-picker trigger — a small smiley button that appears on hover
 * next to the bubble (in the flex row, so hover is never lost).
 * Opens a floating strip of 6 quick emojis.
 */
function EmojiPickerButton({
  onReact,
}: {
  onReact: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative self-end mb-1 flex-shrink-0">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'w-7 h-7 flex items-center justify-center rounded-full text-base',
          'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
          'hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
        )}
        aria-label="Reagir"
      >
        😊
      </button>

      {/* Floating emoji strip */}
      {open && (
        <div
          className={cn(
            'absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-30',
            'flex items-center gap-0.5 px-2 py-1.5',
            'bg-white dark:bg-slate-800 rounded-full shadow-xl',
            'border border-slate-200 dark:border-slate-700',
          )}
        >
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onReact(emoji);
                setOpen(false);
              }}
              className="text-xl w-9 h-9 flex items-center justify-center rounded-full hover:scale-125 hover:bg-slate-100 dark:hover:bg-slate-700 transition-transform duration-100"
              aria-label={`Reagir com ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/** Compact text preview of a message for reply quotes. */
function replyPreviewText(msg: MessagingMessage): string {
  const c = msg.content as unknown as Record<string, unknown>;
  switch (msg.contentType) {
    case 'text': return (c.text as string) || '';
    case 'audio': return '🎤 Áudio';
    case 'image': return '📷 Foto';
    case 'video': return '🎥 Vídeo';
    case 'document': return `📄 ${c.fileName ?? 'Documento'}`;
    case 'location': return '📍 Localização';
    default: return 'Mensagem';
  }
}

// Thumbnail clicável que abre o lightbox
function ImageBubble({ url, caption }: { url: string | null | undefined; caption?: string | null }) {
  const [open, setOpen] = useState(false);
  if (!url) return null;
  return (
    <div className="space-y-1">
      <div
        className="relative group cursor-zoom-in inline-block"
        onClick={() => setOpen(true)}
      >
        <img
          src={url}
          alt={caption || 'Imagem'}
          className="max-w-[240px] rounded-lg block"
        />
        <div className="absolute inset-0 rounded-lg bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
        </div>
      </div>
      {caption && <p className="whitespace-pre-wrap break-words">{caption}</p>}
      {open && <ImageLightbox src={url} alt={caption || 'Imagem'} onClose={() => setOpen(false)} />}
    </div>
  );
}

// Lightbox para visualizar imagens em tela cheia
function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        aria-label="Fechar"
      >
        <X className="w-6 h-6" />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
    </div>,
    document.body
  );
}

export const MessageBubble = memo(function MessageBubble({
  message,
  conversationId,
  allMessages,
  onReply,
  labelColor,
}: MessageBubbleProps) {
  const isOutbound = message.direction === 'outbound';
  const time = format(new Date(message.createdAt), 'HH:mm');
  const { mutate: sendMessage } = useSendMessage();
  const { mutate: deleteMessage, isPending: isDeleting } = useDeleteMessage();
  const { mutate: retryMessage, isPending: isRetrying } = useRetryMessage();
  const { mutate: editMessage, isPending: isEditing } = useEditMessage();

  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState('');
  const editRef = useRef<HTMLTextAreaElement>(null);

  const isDeleted = !!(message.metadata?.deleted_at as string | undefined);
  const isEdited = !!(message.metadata?.edited_at as string | undefined);
  const canEdit = isOutbound && !isDeleted && message.contentType === 'text';

  // Mensagem presa em pending/queued há mais de 3 min — precisa de retry
  const isStuck = isOutbound
    && (message.status === 'pending' || message.status === 'queued')
    && new Date(message.createdAt).getTime() < Date.now() - 3 * 60 * 1000;

  const handleStartEdit = useCallback(() => {
    const current = ((message.content as unknown as Record<string, unknown>).text as string) ?? '';
    setEditText(current);
    setEditMode(true);
    // Foca o textarea no próximo tick
    setTimeout(() => editRef.current?.focus(), 0);
  }, [message.content]);

  const [isSendingResend, setIsSendingResend] = useState(false);

  const handleSaveEdit = useCallback(() => {
    const trimmed = editText.trim();
    if (!trimmed || isSendingResend) return;
    setIsSendingResend(true);
    // Envia nova mensagem com texto corrigido, depois apaga a antiga
    sendMessage(
      { conversationId, content: { type: 'text', text: trimmed } },
      {
        onSuccess: () => {
          deleteMessage({ messageId: message.id, conversationId });
          setEditMode(false);
          setIsSendingResend(false);
        },
        onError: () => setIsSendingResend(false),
      }
    );
  }, [editText, isSendingResend, sendMessage, deleteMessage, message.id, conversationId]);

  const handleCancelEdit = useCallback(() => {
    setEditMode(false);
    setEditText('');
  }, []);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    }
    if (e.key === 'Escape') {
      handleCancelEdit();
    }
  }, [handleSaveEdit, handleCancelEdit]);

  const reactions = (message.metadata?.reactions as Record<string, number> | undefined) ?? {};
  const canReact = !isOutbound && !!message.externalId;

  // Find the message being replied to
  const repliedToMessage = message.replyToMessageId
    ? allMessages?.find((m) => m.id === message.replyToMessageId || m.externalId === message.replyToMessageId)
    : undefined;

  const handleReact = useCallback(
    (emoji: string) => {
      if (!message.externalId) return;
      sendMessage({
        conversationId,
        content: {
          type: 'reaction',
          emoji,
          messageId: message.externalId,
        } as ReactionContent,
      });
    },
    [message.externalId, conversationId, sendMessage],
  );

  // Mensagem apagada — exibe placeholder sem conteúdo
  if (isDeleted) {
    return (
      <div className={cn('flex items-end gap-1', isOutbound ? 'justify-end' : 'justify-start')}>
        <div
          className={cn(
            'rounded-2xl px-4 py-2 shadow-sm italic text-xs opacity-60',
            isOutbound
              ? 'bg-primary-500/40 text-white rounded-br-md'
              : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-bl-md border border-slate-200 dark:border-slate-700',
          )}
        >
          🗑 Mensagem apagada · {time}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-end gap-1 group',
        isOutbound ? 'justify-end' : 'justify-start',
      )}
    >
      {/* Bubble + reaction pills */}
      <div className="relative max-w-[70%]">
        <div
          className={cn(
            'rounded-2xl px-4 py-2 shadow-sm',
            isOutbound
              ? 'bg-primary-500 text-white rounded-br-md'
              : cn(
                  'text-slate-900 dark:text-white rounded-bl-md border',
                  labelColor
                    ? 'border-transparent'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700',
                ),
          )}
          style={!isOutbound && labelColor ? {
            backgroundColor: hexToRgba(labelColor, 0.25),
            borderColor: hexToRgba(labelColor, 0.55),
          } : undefined}
        >
          {/* Reply quote */}
          {repliedToMessage && (
            <div
              className={cn(
                'flex gap-2 mb-2 pl-2 py-1 rounded-lg border-l-2 text-xs',
                isOutbound
                  ? 'border-white/60 bg-white/10 text-white/80'
                  : 'border-primary-400 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
              )}
            >
              <div className="min-w-0">
                <p className={cn('font-medium truncate text-[10px] mb-0.5', isOutbound ? 'text-white/60' : 'text-primary-500')}>
                  {repliedToMessage.direction === 'outbound' ? 'Você' : (repliedToMessage.senderName ?? 'Contato')}
                </p>
                <p className="truncate">{replyPreviewText(repliedToMessage)}</p>
              </div>
            </div>
          )}

          {/* Nome do remetente — inbound: nome do contato/grupo; outbound: atendente ou Julia */}
          {message.senderName && (
            <p className={cn(
              'text-xs font-semibold mb-1',
              isOutbound
                ? 'text-white/80'
                : 'text-primary-600 dark:text-primary-400',
            )}>
              {message.senderName}
            </p>
          )}

          {/* Content — modo edição ou conteúdo normal */}
          <div className="text-sm">
            {editMode ? (
              <div className="flex flex-col gap-1.5">
                <textarea
                  ref={editRef}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  rows={3}
                  className="w-full bg-white/15 text-white placeholder-white/50 rounded-lg px-2 py-1.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-white/40"
                />
                <p className="text-[10px] text-white/50 leading-tight">
                  A mensagem antiga será apagada e esta será reenviada ao cliente.
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="text-[11px] text-white/60 hover:text-white/90 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={isSendingResend || !editText.trim()}
                    className="text-[11px] bg-white/20 hover:bg-white/30 text-white rounded px-2 py-0.5 transition-colors disabled:opacity-40"
                  >
                    {isSendingResend ? 'Enviando...' : 'Apagar e reenviar'}
                  </button>
                </div>
              </div>
            ) : (
              <MessageContent message={message} conversationId={conversationId} />
            )}
          </div>

          {/* Timestamp + delivery status */}
          <div
            className={cn(
              'flex items-center justify-end gap-1 mt-1',
              isOutbound ? 'text-white/70' : 'text-slate-400',
            )}
          >
            {isEdited && (
              <span className={cn('text-[10px] italic', isOutbound ? 'text-white/50' : 'text-slate-400')}>
                editada
              </span>
            )}
            <span className="text-[10px]">{time}</span>
            {isOutbound && <StatusIcon status={message.status} />}
          </div>

          {/* Error: botão de reenviar + mensagem amigável */}
          {(message.status === 'failed' || isStuck) && (
            <div className="flex items-start gap-2 mt-1">
              <p className="text-xs text-red-300 flex-1 leading-tight">
                {isStuck ? 'Envio travado.' : describeFailure(message.errorCode, message.errorMessage)}
              </p>
              {/* Reenviar não ajuda para templates bloqueados pela Meta (131049) */}
              {!(message.contentType === 'template' && message.errorCode === '131049') && (
                <button
                  type="button"
                  disabled={isRetrying}
                  onClick={() => retryMessage(message.id)}
                  className="flex-shrink-0 flex items-center gap-1 text-xs text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded px-1.5 py-0.5 transition-colors disabled:opacity-50"
                  aria-label="Reenviar mensagem"
                >
                  <RotateCcw className={cn('w-3 h-3', isRetrying && 'animate-spin')} />
                  {isRetrying ? 'Reenviando...' : 'Reenviar'}
                </button>
              )}
            </div>
          )}
        </div>

        <ReactionPills reactions={reactions} onReact={handleReact} />
      </div>

      {/* Action buttons — appear on hover, between bubble and edge */}
      <div
        className={cn(
          'flex items-center gap-0.5 mb-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150',
          isOutbound ? 'order-first flex-row-reverse' : '',
        )}
      >
        {/* Reply button */}
        {onReply && (
          <button
            type="button"
            onClick={() => onReply(message)}
            aria-label="Responder"
            className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <Reply className="w-4 h-4" />
          </button>
        )}

        {/* Emoji picker — only for inbound */}
        {canReact && <EmojiPickerButton onReact={handleReact} />}

        {/* Edit button — only for outbound text messages */}
        {canEdit && !editMode && (
          <button
            type="button"
            onClick={handleStartEdit}
            aria-label="Editar mensagem"
            className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-primary-500 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Delete button — only for outbound */}
        {isOutbound && (
          <button
            type="button"
            disabled={isDeleting}
            onClick={() => deleteMessage({ messageId: message.id, conversationId })}
            aria-label="Apagar mensagem"
            className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
});
