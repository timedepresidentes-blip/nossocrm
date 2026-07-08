'use client';

import React, { memo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bell, CalendarClock, Clock, User, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { sanitizeUrl } from '@/lib/utils/sanitize';
import { ChannelIndicator } from './ChannelIndicator';
import { PresenceIndicator } from './PresenceIndicator';
import type { ConversationView } from '@/lib/messaging/types';
import type { PresenceStatus } from '@/lib/messaging/hooks/useContactPresence';

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
  } = conversation;

  const isAssignedToOther = !!assignedUserId && !!currentUserId && assignedUserId !== currentUserId;

  const displayName = externalContactName || 'Contato desconhecido';
  const timeAgo = lastMessageAt
    ? formatDistanceToNow(new Date(lastMessageAt), { addSuffix: true, locale: ptBR })
    : '';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full px-4 py-3 flex items-start gap-3 transition-colors text-left relative',
        'hover:bg-slate-50 dark:hover:bg-white/5',
        'border-b border-slate-100 dark:border-white/5',
        isSelected && 'bg-primary-50 dark:bg-primary-500/10',
        status === 'resolved' && 'opacity-60'
      )}
    >
      {/* Tarja colorida da etiqueta (esquerda) */}
      <span
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-sm transition-colors"
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
              unreadCount > 0
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
