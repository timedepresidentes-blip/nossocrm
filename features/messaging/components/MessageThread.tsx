'use client';

import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { format, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MessageSquare } from 'lucide-react';
import { PresenceIndicator } from './PresenceIndicator';
import { MessageBubble } from './MessageBubble';
import { useMessages } from '@/lib/query/hooks/useMessagesQuery';
import type { MessagingMessage } from '@/lib/messaging/types';

interface MessageThreadProps {
  conversationId: string;
  /** Contact presence status from useContactPresence */
  presenceStatus?: 'online' | 'typing' | 'recording' | 'offline';
  onReply?: (message: MessagingMessage) => void;
  /** Cor hex da primeira etiqueta do contato */
  labelColor?: string;
}

function DateDivider({ date }: { date: Date }) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let label: string;
  if (isSameDay(date, today)) {
    label = 'Hoje';
  } else if (isSameDay(date, yesterday)) {
    label = 'Ontem';
  } else {
    label = format(date, "d 'de' MMMM", { locale: ptBR });
  }

  return (
    <div className="flex items-center justify-center my-4">
      <span className="px-3 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full">
        {label}
      </span>
    </div>
  );
}

export function MessageThread({ conversationId, presenceStatus, onReply, labelColor }: MessageThreadProps) {
  const { data, isLoading, error } = useMessages(conversationId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(0);
  const prevLastMessageIdRef = useRef<string | undefined>(undefined);
  const isInitialLoadRef = useRef(true);

  // Filter out reaction messages — displayed as pills, not standalone bubbles
  const messages = useMemo(
    () => (data ?? []).filter((m) => m.contentType !== 'reaction'),
    [data],
  );

  const lastMessageId = messages[messages.length - 1]?.id;

  // Scroll to bottom when new messages arrive.
  // Tracks both count AND last message ID: when a poll refetch replaces old messages
  // with newer ones (count stays the same), the ID change still triggers the scroll.
  useEffect(() => {
    const isNewLastMessage =
      lastMessageId !== undefined && lastMessageId !== prevLastMessageIdRef.current;
    const isMoreMessages = messages.length > prevMessagesLengthRef.current;

    if (isNewLastMessage || isMoreMessages) {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: isInitialLoadRef.current ? 'auto' : 'smooth',
      });
      isInitialLoadRef.current = false;
    }

    prevMessagesLengthRef.current = messages.length;
    prevLastMessageIdRef.current = lastMessageId;
  }, [messages.length, lastMessageId]);

  // Group messages by date
  const messagesWithDates = useMemo(() => {
    const result: Array<
      { type: 'date'; date: Date } | { type: 'message'; message: MessagingMessage }
    > = [];
    let lastDate: string | null = null;

    messages.forEach((message) => {
      const messageDate = new Date(message.createdAt);
      const dateKey = format(messageDate, 'yyyy-MM-dd');

      if (dateKey !== lastDate) {
        result.push({ type: 'date', date: messageDate });
        lastDate = dateKey;
      }
      result.push({ type: 'message', message });
    });

    return result;
  }, [messages]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-pulse text-slate-400">Carregando mensagens...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-red-500">Erro ao carregar mensagens</div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
        <MessageSquare className="w-12 h-12 mb-3 opacity-50" />
        <p>Nenhuma mensagem ainda</p>
        <p className="text-sm">Envie uma mensagem para iniciar a conversa</p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      role="log"
      aria-live="polite"
      aria-label="Mensagens da conversa"
      className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50 dark:bg-slate-900/50"
    >
      {messagesWithDates.map((item, index) => {
        if (item.type === 'date') {
          return <DateDivider key={`date-${format(item.date, 'yyyy-MM-dd')}`} date={item.date} />;
        }
        return (
          <MessageBubble
            key={item.message.id}
            message={item.message}
            conversationId={conversationId}
            allMessages={messages}
            onReply={onReply}
            labelColor={labelColor}
          />
        );
      })}

      {/* Typing / recording indicator */}
      {presenceStatus && presenceStatus !== 'offline' && presenceStatus !== 'online' && (
        <div className="flex items-center gap-2 px-2 py-1.5">
          <PresenceIndicator status={presenceStatus} showLabel size="md" />
        </div>
      )}
    </div>
  );
}
