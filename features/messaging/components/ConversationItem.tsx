'use client';

import React, { memo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bell, BellRing, CalendarClock, Clock, User, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { sanitizeUrl } from '@/lib/utils/sanitize';
import { ChannelIndicator } from './ChannelIndicator';
import { PresenceIndicator } from './PresenceIndicator';
import type { ConversationView } from '@/lib/messaging/types';
import type { PresenceStatus } from '@/lib/messaging/hooks/useContactPresence';

function hexToRgba(hex: string, alpha: number): string {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return 'transparent';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Retorna true se o texto sobre esse fundo colorido deve ser escuro (para manter legibilidade). */
function needsDarkText(hex: string, alpha: number): boolean {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return true;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  // Composição com branco (light mode)
  const cr = r * alpha + (1 - alpha);
  const cg = g * alpha + (1 - alpha);
  const cb = b * alpha + (1 - alpha);
  const lum = 0.299 * cr + 0.587 * cg + 0.114 * cb;
  return lum > 0.45;
}

interface ConversationItemProps {
  conversation: ConversationView;
  isSelected: boolean;
  onClick: () => void;
  presenceStatus?: PresenceStatus;
  /** Sinaliza mensagem agendada pendente nesta conversa */
  hasScheduled?: boolean;
  /** Sinaliza lembrete/tarefa pendente vinculado ao contato desta conversa */
  hasReminder?: boolean;
  /** ID do usuário logado — para destacar atribuição a outro atendente */
  currentUserId?: string;
  /** Cor hex da primeira etiqueta do contato */
  labelColor?: string;
}

export const ConversationItem = memo(function ConversationItem({
  conversation,
  isSelected,
  onClick,
  presenceStatus = 'offline',
  hasScheduled = false,
  hasReminder = false,
  currentUserId,
  labelColor,
}: ConversationItemProps) {
  const {
    externalContactName,
    externalContactAvatar,
    channelType,
    lastMessagePreview,
    lastMessageAt,
    lastMessageDirection,
    unreadCount,
    isWindowExpired,
    windowMinutesRemaining,
    assignedUserName,
    assignedUserId,
    status,
    metadata,
  } = conversation;

  const isHandoffPending = metadata?.ai_handoff_pending === true;

  const [isHovered, setIsHovered] = useState(false);

  const isAssignedToOther = !!assignedUserId && !!currentUserId && assignedUserId !== currentUserId;

  const displayName = externalContactName || 'Contato desconhecido';

  const bgAlpha = isSelected ? 0.55 : isHovered ? 0.42 : 0.28;
  const labelBgStyle = labelColor ? { backgroundColor: hexToRgba(labelColor, bgAlpha) } : undefined;
  // Em light mode com fundo muito escuro, força texto escuro para manter legibilidade
  const forceDarkText = !!labelColor && needsDarkText(labelColor, bgAlpha);
  const timeAgo = lastMessageAt
    ? formatDistanceToNow(new Date(lastMessageAt), { addSuffix: true, locale: ptBR })
    : '';

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={labelBgStyle}
      className={cn(
        'w-full px-4 py-3 flex items-start gap-3 transition-colors text-left relative',
        !labelColor && 'hover:bg-slate-50 dark:hover:bg-white/5',
        'border-b border-slate-100 dark:border-white/5',
        !labelColor && isSelected && 'bg-primary-50 dark:bg-primary-500/10',
        status === 'resolved' && 'opacity-60'
      )}
    >
      {/* Indicador lateral — cor da etiqueta (sempre) ou cor primária se selecionado sem etiqueta */}
      <span
        className="absolute left-0 top-0 bottom-0 w-[6px] rounded-r-sm transition-colors"
        style={{ backgroundColor: labelColor ?? (isSelected ? 'var(--color-primary-500)' : 'transparent') }}
      />
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {sanitizeUrl(externalContactAvatar) ? (
          <img
            src={sanitizeUrl(externalContactAvatar)}
            alt={displayName}
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
            <User className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          </div>
        )}
        {/* Channel indicator */}
        <div className="absolute -bottom-0.5 -right-0.5">
          <ChannelIndicator type={channelType} size="sm" />
        </div>
        {/* Presence dot */}
        {presenceStatus !== 'offline' && (
          <div className="absolute -top-0.5 -right-0.5">
            <PresenceIndicator status={presenceStatus} size="sm" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0" data-testid="conv-v3">
        {/* Linha 1: Nome (esquerda) + horário (direita) */}
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'font-medium truncate text-sm',
              forceDarkText
                ? 'text-slate-900 dark:text-white'
                : unreadCount > 0
                  ? 'text-slate-900 dark:text-white'
                  : 'text-slate-700 dark:text-slate-300'
            )}
          >
            {displayName}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
            {timeAgo}
          </span>
        </div>

        {/* Linha 2: Preview (esquerda) + badge de não lidas verde (direita) — layout WhatsApp */}
        <div className="flex items-center justify-between gap-1.5 mt-0.5">
          <div className="flex items-center gap-1 flex-1 min-w-0">
            {lastMessageDirection === 'outbound' && (
              <span className="text-xs text-slate-400 flex-shrink-0">Você:</span>
            )}
            <p
              className={cn(
                'text-sm truncate',
                unreadCount > 0
                  ? 'text-slate-700 dark:text-slate-200 font-medium'
                  : 'text-slate-500 dark:text-slate-400'
              )}
            >
              {lastMessagePreview || 'Sem mensagens'}
            </p>
          </div>
          {unreadCount > 0 && (
            <span
              style={{ backgroundColor: '#22c55e' }}
              className="flex-shrink-0 min-w-[20px] h-5 px-1.5 flex items-center justify-center text-[11px] font-bold rounded-full text-white leading-none"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>

        {/* Linha 3: Badges de status */}
        <div className="flex items-center gap-2 mt-1.5">

          {/* Aguardando atendimento humano (handoff da Júlia) */}
          {isHandoffPending && (
            <span
              title="Júlia transferiu — aguardando atendimento"
              className="flex items-center gap-0.5 text-xs text-orange-600 dark:text-orange-400 font-medium animate-pulse"
            >
              <BellRing className="w-3 h-3" />
              Aguardando
            </span>
          )}

          {/* Mensagem agendada */}
          {hasScheduled && (
            <span
              title="Mensagem agendada"
              className="flex items-center gap-0.5 text-xs text-indigo-600 dark:text-indigo-400"
            >
              <CalendarClock className="w-3 h-3" />
            </span>
          )}

          {/* Lembrete/tarefa pendente */}
          {hasReminder && (
            <span
              title="Tarefa agendada"
              className="flex items-center gap-0.5 text-xs text-amber-600 dark:text-amber-400"
            >
              <Bell className="w-3 h-3" />
            </span>
          )}

          {/* Window expiry */}
          {!isWindowExpired && windowMinutesRemaining !== undefined && windowMinutesRemaining <= 60 && (
            <span className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
              <Clock className="w-3 h-3" />
              {windowMinutesRemaining}min
            </span>
          )}
          {isWindowExpired && (
            <span className="text-xs text-red-500">Janela expirada</span>
          )}

          {/* Atribuição */}
          {assignedUserName && (
            <span
              className={cn(
                'flex items-center gap-0.5 text-xs truncate max-w-[90px]',
                isAssignedToOther
                  ? 'text-orange-500 dark:text-orange-400 font-medium'
                  : 'text-slate-400'
              )}
              title={isAssignedToOther ? `Atribuído a ${assignedUserName}` : assignedUserName}
            >
              {isAssignedToOther && <UserCheck className="w-3 h-3 flex-shrink-0" />}
              {assignedUserName}
            </span>
          )}
        </div>
      </div>
    </button>
  );
});
