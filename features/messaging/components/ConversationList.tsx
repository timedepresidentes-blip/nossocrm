'use client';

import React, { useState, useMemo, useCallback, memo, useEffect, useRef } from 'react';
import { Search, Filter, Inbox, CheckCircle, X, Plus, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConversationItem } from './ConversationItem';
import { ChannelIndicator } from './ChannelIndicator';
import { useConversations } from '@/lib/query/hooks/useConversationsQuery';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { ConversationFilters, ConversationStatus, ChannelType, ConversationView } from '@/lib/messaging/types';
import type { PresenceStatus } from '@/lib/messaging/hooks/useContactPresence';

interface ContactResult {
  id: string;
  name: string;
  phone: string;
}

interface ConversationItemWrapperProps {
  conversation: ConversationView;
  isSelected: boolean;
  onSelect: (id: string) => void;
  presenceStatus?: PresenceStatus;
}

const ConversationItemWrapper = memo(function ConversationItemWrapper({
  conversation,
  isSelected,
  onSelect,
  presenceStatus,
}: ConversationItemWrapperProps) {
  const handleClick = useCallback(() => {
    onSelect(conversation.id);
  }, [onSelect, conversation.id]);

  return (
    <ConversationItem
      conversation={conversation}
      isSelected={isSelected}
      onClick={handleClick}
      presenceStatus={presenceStatus}
    />
  );
});

interface ConversationListProps {
  selectedId?: string;
  onSelect: (conversationId: string) => void;
  onNewConversation?: () => void;
  onStartConversationWithContact?: (params: { contactId: string; contactName: string; contactPhone: string }) => void;
  businessUnitId?: string;
  getPresence?: (contactId: string) => 'online' | 'typing' | 'recording' | 'offline';
}

const CHANNEL_OPTIONS: { id: ChannelType | 'all'; label: string }[] = [
  { id: 'all', label: 'Todos os canais' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'email', label: 'Email' },
  { id: 'sms', label: 'SMS' },
];

export const ConversationList = memo(function ConversationList({
  selectedId,
  onSelect,
  onNewConversation,
  onStartConversationWithContact,
  businessUnitId,
  getPresence,
}: ConversationListProps) {
  const { profile } = useAuth();
  const [statusFilter, setStatusFilter] = useState<ConversationStatus | 'all'>('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState<ChannelType | 'all'>('all');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Busca de contatos paralela à busca de conversas
  const [contactResults, setContactResults] = useState<ContactResult[]>([]);
  const [isSearchingContacts, setIsSearchingContacts] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (!searchQuery.trim() || searchQuery.length < 2 || !profile?.organization_id) {
      setContactResults([]);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      setIsSearchingContacts(true);
      try {
        const { data } = await supabase
          .from('contacts')
          .select('id, name, phone')
          .eq('organization_id', profile.organization_id)
          .or(`name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%`)
          .not('phone', 'is', null)
          .neq('phone', '')
          .limit(5);
        setContactResults(data || []);
      } catch {
        setContactResults([]);
      } finally {
        setIsSearchingContacts(false);
      }
    }, 300);

    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [searchQuery, profile?.organization_id]);

  // Limpar contatos ao limpar busca
  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setContactResults([]);
  }, []);

  const filters: ConversationFilters = useMemo(() => ({
    status: statusFilter,
    businessUnitId,
    search: searchQuery || undefined,
    channelId: channelFilter !== 'all' ? channelFilter : undefined,
    hasUnread: showUnreadOnly || undefined,
  }), [statusFilter, businessUnitId, searchQuery, channelFilter, showUnreadOnly]);

  const { data: conversations, isLoading, error } = useConversations(filters);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (channelFilter !== 'all') count++;
    if (showUnreadOnly) count++;
    return count;
  }, [channelFilter, showUnreadOnly]);

  const clearFilters = () => {
    setChannelFilter('all');
    setShowUnreadOnly(false);
  };

  const statusTabs = [
    { id: 'open' as const, label: 'Abertas', icon: Inbox },
    { id: 'resolved' as const, label: 'Resolvidas', icon: CheckCircle },
  ];

  const showContactResults = searchQuery.length >= 2 && contactResults.length > 0 && !!onStartConversationWithContact;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-white/10">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-white/10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Conversas
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'relative p-2 rounded-lg transition-colors',
                showFilters || activeFiltersCount > 0
                  ? 'bg-primary-100 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400'
                  : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-600 dark:hover:text-white'
              )}
              title="Filtros"
              aria-label="Filtros"
              aria-expanded={showFilters}
            >
              <Filter className="w-4 h-4" />
              {activeFiltersCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center text-[10px] font-bold text-white bg-primary-500 rounded-full">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Botão Nova Conversa — proeminente */}
        {onNewConversation && (
          <button
            type="button"
            onClick={onNewConversation}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 mb-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white text-sm font-semibold transition-colors shadow-sm"
            aria-label="Nova conversa"
          >
            <Plus className="w-4 h-4" />
            Nova conversa
          </button>
        )}

        {/* Search — busca conversas e contatos */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar conversa ou contato..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-100 dark:bg-white/5 border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-slate-900 dark:text-white placeholder-slate-400"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Limpar busca"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 mt-3">
          {statusTabs.map((tab) => {
            const isActive = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
                  isActive
                    ? 'bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Additional Filters Panel */}
        {showFilters && (
          <div className="mt-3 p-3 bg-slate-50 dark:bg-white/5 rounded-lg space-y-3">
            {/* Channel Filter */}
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                Canal
              </label>
              <div className="flex flex-wrap gap-1.5">
                {CHANNEL_OPTIONS.map((channel) => (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => setChannelFilter(channel.id)}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full transition-colors',
                      channelFilter === channel.id
                        ? 'bg-primary-500 text-white'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 hover:border-primary-300'
                    )}
                  >
                    {channel.id !== 'all' && (
                      <ChannelIndicator type={channel.id as ChannelType} size="sm" />
                    )}
                    {channel.id === 'all' ? channel.label : ''}
                  </button>
                ))}
              </div>
            </div>

            {/* Unread Filter */}
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Apenas não lidas
              </label>
              <button
                type="button"
                role="switch"
                aria-checked={showUnreadOnly}
                aria-label="Apenas não lidas"
                onClick={() => setShowUnreadOnly(!showUnreadOnly)}
                className={cn(
                  'relative w-9 h-5 rounded-full transition-colors',
                  showUnreadOnly
                    ? 'bg-primary-500'
                    : 'bg-slate-300 dark:bg-slate-600'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                    showUnreadOnly && 'translate-x-4'
                  )}
                />
              </button>
            </div>

            {/* Clear Filters */}
            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="w-full py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
              >
                Limpar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse flex gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                  <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-4 text-center text-red-500">
            Erro ao carregar conversas
          </div>
        ) : (
          <>
            {/* Conversas encontradas */}
            {conversations && conversations.length > 0 && (
              <>
                {searchQuery && (
                  <p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Conversas
                  </p>
                )}
                {conversations.map((conversation) => (
                  <ConversationItemWrapper
                    key={conversation.id}
                    conversation={conversation}
                    isSelected={conversation.id === selectedId}
                    onSelect={onSelect}
                    presenceStatus={conversation.contactId && getPresence ? getPresence(conversation.contactId) : undefined}
                  />
                ))}
              </>
            )}

            {/* Contatos encontrados pela busca */}
            {showContactResults && (
              <div className={conversations && conversations.length > 0 ? 'border-t border-slate-100 dark:border-white/5 mt-1' : ''}>
                <p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Contatos
                </p>
                {contactResults.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => onStartConversationWithContact?.({
                      contactId: contact.id,
                      contactName: contact.name,
                      contactPhone: contact.phone,
                    })}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-left group"
                  >
                    <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {(contact.name || '?').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{contact.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{contact.phone}</p>
                    </div>
                    <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MessageSquare className="w-3.5 h-3.5" />
                      Iniciar
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Estado vazio */}
            {(!conversations || conversations.length === 0) && !showContactResults && (
              <div className="p-8 text-center">
                <Inbox className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                  {searchQuery
                    ? isSearchingContacts
                      ? 'Buscando...'
                      : 'Nenhuma conversa ou contato encontrado'
                    : statusFilter === 'open'
                      ? 'Nenhuma conversa aberta'
                      : 'Nenhuma conversa resolvida'}
                </p>
                {!searchQuery && onNewConversation && (
                  <button
                    type="button"
                    onClick={onNewConversation}
                    className="mt-3 text-sm text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
                  >
                    Iniciar nova conversa
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});
