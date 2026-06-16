'use client';

import React, { memo, useState, useEffect, useRef } from 'react';
import {
  User,
  Phone,
  Mail,
  Calendar,
  Clock,
  ExternalLink,
  Briefcase,
  ChevronDown,
  ChevronUp,
  LinkIcon,
  MessageSquare,
  GitMerge,
  BotOff,
  Bot,
  StickyNote,
  X,
  Plus,
  Trash2,
  Check,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { sanitizeUrl } from '@/lib/utils/sanitize';
import type { ConversationView } from '@/lib/messaging/types';
import { ChannelIndicator } from './ChannelIndicator';
import { WindowExpiryBadge } from './WindowExpiryBadge';
import { ContactPanelSkeleton } from './skeletons/ContactPanelSkeleton';
import { useUpdateContact } from '@/lib/query/hooks/useContactsQuery';
import { useToggleConversationAiPause } from '@/lib/query/hooks/useMessagingConversationsQuery';
import { useContactNotes, useCreateContactNote, useDeleteContactNote } from '@/lib/query/hooks/useContactNotesQuery';
import { useLabels, useContactLabels, useAssignLabel, useRemoveLabel, useCreateLabel } from '@/lib/query/hooks/useLabelsQuery';

interface ContactPanelProps {
  conversation: ConversationView | null | undefined;
  isLoading?: boolean;
  onLinkContact?: () => void;
  onViewContact?: (contactId: string) => void;
  onViewDeals?: (contactId: string) => void;
  hasDuplicate?: boolean;
  onResolveDuplicate?: () => void;
  className?: string;
}

interface InfoRowProps {
  icon: React.FC<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  className?: string;
}

const InfoRow = memo(function InfoRow({ icon: Icon, label, value, className }: InfoRowProps) {
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <Icon className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        <div className="text-sm text-slate-900 dark:text-white break-words">
          {value}
        </div>
      </div>
    </div>
  );
});

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const Section = memo(function Section({ title, defaultOpen = true, children }: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-slate-200 dark:border-white/10 last:border-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 py-3 px-1 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {title}
        </span>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>
      {isOpen && <div className="pb-4 space-y-3">{children}</div>}
    </div>
  );
});

export const ContactPanel = memo(function ContactPanel({
  conversation,
  isLoading,
  onLinkContact,
  onViewContact,
  onViewDeals,
  hasDuplicate,
  onResolveDuplicate,
  className,
}: ContactPanelProps) {
  // Hooks must be called unconditionally before any early returns
  const updateContact = useUpdateContact();
  const toggleConversationAiPause = useToggleConversationAiPause();

  const contactId = conversation?.contactId;

  // Notas
  const { data: notes = [] } = useContactNotes(contactId);
  const createNote = useCreateContactNote();
  const deleteNote = useDeleteContactNote();
  const [noteText, setNoteText] = useState('');

  // Etiquetas
  const { data: allLabels = [] } = useLabels();
  const { data: contactLabels = [] } = useContactLabels(contactId);
  const assignLabel = useAssignLabel();
  const removeLabel = useRemoveLabel();
  const createLabel = useCreateLabel();
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#6366f1');
  const labelPickerRef = useRef<HTMLDivElement>(null);

  // Fecha o picker de etiquetas ao clicar fora
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (labelPickerRef.current && !labelPickerRef.current.contains(e.target as Node)) {
        setShowLabelPicker(false);
      }
    }
    if (showLabelPicker) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showLabelPicker]);

  function handleSaveNote() {
    if (!contactId || !noteText.trim()) return;
    createNote.mutate({ contactId, content: noteText.trim() }, {
      onSuccess: () => setNoteText(''),
    });
  }

  function handleCreateLabel() {
    if (!newLabelName.trim()) return;
    createLabel.mutate({ name: newLabelName.trim(), color: newLabelColor }, {
      onSuccess: () => { setNewLabelName(''); setNewLabelColor('#6366f1'); },
    });
  }
  const conversationMeta = conversation?.metadata as Record<string, unknown> | undefined;

  // Valor real vindo do banco (via query)
  const dbAiPaused = contactId
    ? (conversation?.contactAiPaused ?? false)
    : (
        conversationMeta?.ai_paused === true ||
        (conversationMeta?.ai_paused !== false && !!conversation?.assignedAt)
      );

  // Estado local otimista: null = usa valor do banco, true/false = valor pendente
  const [localAiPaused, setLocalAiPaused] = useState<boolean | null>(null);
  const isAiPaused = localAiPaused !== null ? localAiPaused : dbAiPaused;

  // Quando o banco atualizar (query refetch), descarta o estado local
  useEffect(() => {
    setLocalAiPaused(null);
  }, [dbAiPaused]);

  const isPending = updateContact.isPending || toggleConversationAiPause.isPending;

  function handleActivateAi() {
    if (!conversation) return;
    setLocalAiPaused(false);
    if (contactId) {
      updateContact.mutate(
        { id: contactId, updates: { aiPaused: false } },
        { onError: () => setLocalAiPaused(null) }
      );
    } else {
      toggleConversationAiPause.mutate(
        { conversationId: conversation.id, paused: false, currentMetadata: conversation.metadata as Record<string, unknown> },
        { onError: () => setLocalAiPaused(null) }
      );
    }
  }

  function handlePauseAi() {
    if (!conversation) return;
    setLocalAiPaused(true);
    if (contactId) {
      updateContact.mutate(
        { id: contactId, updates: { aiPaused: true } },
        { onError: () => setLocalAiPaused(null) }
      );
    } else {
      toggleConversationAiPause.mutate(
        { conversationId: conversation.id, paused: true, currentMetadata: conversation.metadata as Record<string, unknown> },
        { onError: () => setLocalAiPaused(null) }
      );
    }
  }

  if (isLoading) {
    return <ContactPanelSkeleton className={className} />;
  }

  if (!conversation) {
    return (
      <div className={cn('p-4', className)}>
        <div className="text-center py-8">
          <MessageSquare className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Selecione uma conversa para ver detalhes
          </p>
        </div>
      </div>
    );
  }

  const {
    externalContactName,
    externalContactAvatar,
    contactName,
    contactEmail,
    contactPhone,
    channelType,
    channelName,
    windowExpiresAt,
    assignedUserName,
    createdAt,
    lastMessageAt,
    messageCount,
    status,
    priority,
  } = conversation;

  const displayName = contactName || externalContactName || 'Contato desconhecido';
  const hasLinkedContact = !!contactId;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-white/10">
        {/* Avatar & Name */}
        <div className="flex items-start gap-3">
          <div className="relative flex-shrink-0">
            {sanitizeUrl(externalContactAvatar) ? (
              <img
                src={sanitizeUrl(externalContactAvatar)}
                alt={displayName}
                className="w-14 h-14 rounded-full object-cover"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                <User className="w-7 h-7 text-slate-500 dark:text-slate-400" />
              </div>
            )}
            {/* Channel indicator on avatar */}
            <div className="absolute -bottom-1 -right-1">
              <ChannelIndicator type={channelType} size="sm" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white truncate">
              {displayName}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {channelName}
            </p>
            {/* Status badges */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span
                className={cn(
                  'px-2 py-0.5 text-xs font-medium rounded-full',
                  status === 'open'
                    ? 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400'
                    : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400'
                )}
              >
                {status === 'open' ? 'Aberto' : 'Resolvido'}
              </span>
              {priority && priority !== 'normal' && (
                <span
                  className={cn(
                    'px-2 py-0.5 text-xs font-medium rounded-full',
                    priority === 'high' && 'bg-orange-100 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400',
                    priority === 'urgent' && 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400'
                  )}
                >
                  {priority === 'high' ? 'Alta' : priority === 'urgent' ? 'Urgente' : priority}
                </span>
              )}
              <WindowExpiryBadge windowExpiresAt={windowExpiresAt} variant="inline" />
              {hasDuplicate && (
                <button
                  type="button"
                  onClick={onResolveDuplicate}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-500/20 transition-colors"
                >
                  <GitMerge className="w-3 h-3" />
                  Duplicado
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2 mt-4">
          {hasLinkedContact && onViewContact && (
            <button
              type="button"
              onClick={() => onViewContact(contactId!)}
              className={cn(
                'flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium',
                'bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400',
                'hover:bg-primary-100 dark:hover:bg-primary-500/20 transition-colors'
              )}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Ver Contato
            </button>
          )}
          {!hasLinkedContact && onLinkContact && (
            <button
              type="button"
              onClick={onLinkContact}
              className={cn(
                'flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium',
                'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300',
                'hover:bg-slate-200 dark:hover:bg-white/10 transition-colors'
              )}
            >
              <LinkIcon className="w-3.5 h-3.5" />
              Vincular Contato
            </button>
          )}
          {hasLinkedContact && onViewDeals && (
            <button
              type="button"
              onClick={() => onViewDeals(contactId!)}
              className={cn(
                'flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium',
                'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300',
                'hover:bg-slate-200 dark:hover:bg-white/10 transition-colors'
              )}
            >
              <Briefcase className="w-3.5 h-3.5" />
              Deals
            </button>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Contact Info */}
        <Section title="Informações">
          {contactPhone && (
            <InfoRow icon={Phone} label="Telefone" value={contactPhone} />
          )}
          {contactEmail && (
            <InfoRow icon={Mail} label="Email" value={contactEmail} />
          )}
          {assignedUserName && (
            <InfoRow icon={User} label="Atribuído para" value={assignedUserName} />
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              {isAiPaused ? (
                <BotOff className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              ) : (
                <Bot className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Julia {contactId ? '(contato)' : '(conversa)'}
                </p>
                <p className={cn(
                  'text-sm font-medium',
                  isAiPaused ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'
                )}>
                  {isAiPaused ? 'Pausada' : 'Ativa'}
                </p>
              </div>
            </div>
            {isAiPaused ? (
              <button
                type="button"
                disabled={isPending}
                onClick={handleActivateAi}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded-lg',
                  'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400',
                  'hover:bg-green-200 dark:hover:bg-green-500/20 transition-colors',
                  isPending && 'opacity-50 cursor-not-allowed'
                )}
              >
                Ativar
              </button>
            ) : (
              <button
                type="button"
                disabled={isPending}
                onClick={handlePauseAi}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded-lg',
                  'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400',
                  'hover:bg-amber-100 dark:hover:bg-amber-500/10 hover:text-amber-700 dark:hover:text-amber-400 transition-colors',
                  isPending && 'opacity-50 cursor-not-allowed'
                )}
              >
                Pausar
              </button>
            )}
          </div>
        </Section>

        {/* Conversation Stats */}
        <Section title="Conversa">
          <InfoRow
            icon={MessageSquare}
            label="Mensagens"
            value={`${messageCount} mensage${messageCount === 1 ? 'm' : 'ns'}`}
          />
          <InfoRow
            icon={Calendar}
            label="Iniciada em"
            value={createdAt ? format(new Date(createdAt), "d 'de' MMMM 'de' yyyy", { locale: ptBR }) : '-'}
          />
          <InfoRow
            icon={Clock}
            label="Última mensagem"
            value={
              lastMessageAt
                ? formatDistanceToNow(new Date(lastMessageAt), { addSuffix: true, locale: ptBR })
                : '-'
            }
          />
        </Section>

        {/* Etiquetas */}
        {contactId && (
          <Section title="Etiquetas" defaultOpen>
            <div className="flex flex-wrap gap-1.5">
              {contactLabels.map(label => (
                <span
                  key={label.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                  style={{ backgroundColor: label.color }}
                >
                  {label.name}
                  <button
                    type="button"
                    onClick={() => removeLabel.mutate({ contactId, labelId: label.id })}
                    className="opacity-70 hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}

              {/* Botão + e picker */}
              <div className="relative" ref={labelPickerRef}>
                <button
                  type="button"
                  onClick={() => setShowLabelPicker(v => !v)}
                  className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs border border-dashed border-slate-300 dark:border-white/20 text-slate-500 dark:text-slate-400 hover:border-primary-400 hover:text-primary-500 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Adicionar
                </button>

                {showLabelPicker && (
                  <div className="absolute left-0 top-7 z-20 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl shadow-lg p-2">
                    {/* Etiquetas existentes */}
                    <div className="space-y-1 max-h-36 overflow-y-auto mb-2">
                      {allLabels
                        .filter(l => !contactLabels.some(cl => cl.id === l.id))
                        .map(label => (
                          <button
                            key={label.id}
                            type="button"
                            onClick={() => {
                              assignLabel.mutate({ contactId, labelId: label.id });
                              setShowLabelPicker(false);
                            }}
                            className="w-full flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-left"
                          >
                            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: label.color }} />
                            <span className="text-xs text-slate-700 dark:text-slate-300 truncate">{label.name}</span>
                          </button>
                        ))}
                      {allLabels.filter(l => !contactLabels.some(cl => cl.id === l.id)).length === 0 && (
                        <p className="text-xs text-slate-400 px-2 py-1">Todas as etiquetas já aplicadas</p>
                      )}
                    </div>

                    {/* Criar nova etiqueta */}
                    <div className="border-t border-slate-100 dark:border-white/10 pt-2 space-y-1.5">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400 px-1">Nova etiqueta</p>
                      <div className="flex gap-1.5">
                        <input
                          type="color"
                          value={newLabelColor}
                          onChange={e => setNewLabelColor(e.target.value)}
                          className="w-7 h-7 rounded cursor-pointer border-0 p-0"
                        />
                        <input
                          type="text"
                          placeholder="Nome da etiqueta"
                          value={newLabelName}
                          onChange={e => setNewLabelName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleCreateLabel()}
                          className="flex-1 px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
                        />
                        <button
                          type="button"
                          onClick={handleCreateLabel}
                          disabled={!newLabelName.trim()}
                          className="p-1 rounded-lg bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-40 transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Section>
        )}

        {/* Notas internas */}
        {contactId && (
          <Section title="Notas" defaultOpen={false}>
            {/* Campo para nova nota */}
            <div className="space-y-2">
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="Adicionar nota interna…"
                rows={3}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-primary-400 resize-none"
              />
              <button
                type="button"
                onClick={handleSaveNote}
                disabled={!noteText.trim() || createNote.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-40 transition-colors"
              >
                <StickyNote className="w-3.5 h-3.5" />
                {createNote.isPending ? 'Salvando…' : 'Salvar nota'}
              </button>
            </div>

            {/* Lista de notas existentes */}
            {notes.length > 0 && (
              <div className="mt-3 space-y-2">
                {notes.map(note => (
                  <div
                    key={note.id}
                    className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 group relative"
                  >
                    <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{note.content}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[10px] text-slate-400">
                        {note.createdByName ?? 'Você'} · {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true, locale: ptBR })}
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteNote.mutate({ noteId: note.id, contactId })}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-400 hover:text-red-500 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {notes.length === 0 && (
              <p className="text-xs text-slate-400 mt-2">Nenhuma nota ainda.</p>
            )}
          </Section>
        )}
      </div>
    </div>
  );
});

export default ContactPanel;
