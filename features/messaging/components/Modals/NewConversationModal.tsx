'use client';

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  MessageSquare,
  User,
  Phone,
  Plus,
  X,
  ChevronRight,
  Loader2,
  Search,
  FileText,
  Send,
  CheckCircle2,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import { useConnectedChannelsQuery } from '@/lib/query/hooks/useChannelsQuery';
import { ChannelIndicator } from '../ChannelIndicator';
import type { MessagingChannel, ChannelType, MessagingTemplate } from '@/lib/messaging/types';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useApprovedTemplatesQuery, useSendTemplateMutation } from '@/lib/query/hooks/useTemplatesQuery';

interface ContactSuggestion {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
}

interface NewConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateConversation: (params: {
    channelId: string;
    phoneNumber: string;
    contactName?: string;
    contactId?: string;
  }) => Promise<string | undefined>;
  defaultContactId?: string;
  defaultContactName?: string;
  defaultContactPhone?: string;
}

type Step = 'channel' | 'recipient' | 'template' | 'confirm';

// Extrai variáveis {{N}}, {{N-nome}} ou {{}} (legado) do texto do template
function extractTemplateVars(text: string): string[] {
  // Normaliza {{}} → {{1}}, {{2}}... para templates com formato legado
  let counter = 0;
  const normalized = text.replace(/\{\{\}\}/g, () => `{{${++counter}}}`);
  const regex = /\{\{(\d+)(?:-[a-zA-Z_][a-zA-Z0-9_]*)?\}\}/g;
  const matches: string[] = [];
  let m;
  while ((m = regex.exec(normalized)) !== null) {
    if (!matches.includes(m[1])) matches.push(m[1]);
  }
  return matches;
}

// Label legível para variável (ex: {{1-nome}} → "nome", {{1}} → "variável 1")
function varLabel(text: string, index: string): string {
  const m = new RegExp(`\\{\\{${index}-([a-zA-Z_][a-zA-Z0-9_]*)\\}\\}`).exec(text);
  return m ? m[1] : `variável ${index}`;
}

// Texto de prévia do template (corpo)
function templatePreview(t: MessagingTemplate): string {
  return t.components.find((c) => c.type === 'BODY')?.text || t.name;
}

export function NewConversationModal({
  isOpen,
  onClose,
  onCreateConversation,
  defaultContactId,
  defaultContactName,
  defaultContactPhone,
}: NewConversationModalProps) {
  const { data: channels = [], isLoading: isLoadingChannels } = useConnectedChannelsQuery();
  const { profile } = useAuth();

  const [step, setStep] = useState<Step>('channel');
  const [selectedChannel, setSelectedChannel] = useState<MessagingChannel | null>(null);
  const [phoneNumber, setPhoneNumber] = useState(defaultContactPhone || '');
  const [contactName, setContactName] = useState(defaultContactName || '');
  const [selectedContact, setSelectedContact] = useState<ContactSuggestion | null>(
    defaultContactId && defaultContactName
      ? { id: defaultContactId, name: defaultContactName, phone: defaultContactPhone }
      : null
  );
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contactSearch, setContactSearch] = useState('');
  const [contactSuggestions, setContactSuggestions] = useState<ContactSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Estado da etapa de template
  const [selectedTemplate, setSelectedTemplate] = useState<MessagingTemplate | null>(null);
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});

  const { data: templates = [], isLoading: isLoadingTemplates } = useApprovedTemplatesQuery(
    selectedChannel?.id ?? null
  );
  const { mutateAsync: sendTemplateMutateAsync } = useSendTemplateMutation();

  // Variáveis do template selecionado
  const templateVars = useMemo(() => {
    if (!selectedTemplate) return [];
    const all: string[] = [];
    selectedTemplate.components.forEach((c) => {
      if (c.text) all.push(...extractTemplateVars(c.text));
    });
    return [...new Set(all)].sort((a, b) => parseInt(a) - parseInt(b));
  }, [selectedTemplate]);

  const bodyText = selectedTemplate?.components.find((c) => c.type === 'BODY')?.text ?? '';

  useEffect(() => {
    if (isOpen) {
      setStep('channel');
      setSelectedChannel(null);
      setPhoneNumber(defaultContactPhone || '');
      setContactName(defaultContactName || '');
      setSelectedContact(
        defaultContactId && defaultContactName
          ? { id: defaultContactId, name: defaultContactName, phone: defaultContactPhone }
          : null
      );
      setIsCreating(false);
      setError(null);
      setContactSearch('');
      setContactSuggestions([]);
      setSelectedTemplate(null);
      setTemplateVariables({});
    }
  }, [isOpen, defaultContactPhone, defaultContactName, defaultContactId]);

  // Busca contatos enquanto o usuário digita
  useEffect(() => {
    if (!contactSearch.trim() || contactSearch.length < 2) {
      setContactSuggestions([]);
      return;
    }
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      if (!profile?.organization_id) return;
      setIsSearching(true);
      try {
        const q = contactSearch.trim();
        const { data } = await supabase
          .from('contacts')
          .select('id, name, phone, email')
          .eq('organization_id', profile.organization_id)
          .is('deleted_at', null)
          .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
          .order('name')
          .limit(6);
        setContactSuggestions(data ?? []);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, [contactSearch, profile?.organization_id]);

  const handleClose = useCallback(() => {
    setStep('channel');
    setSelectedChannel(null);
    setPhoneNumber(defaultContactPhone || '');
    setContactName(defaultContactName || '');
    setSelectedContact(null);
    setError(null);
    setContactSearch('');
    setContactSuggestions([]);
    setSelectedTemplate(null);
    setTemplateVariables({});
    onClose();
  }, [onClose, defaultContactPhone, defaultContactName]);

  const initiableChannels = useMemo(
    () => channels.filter((c) => ['whatsapp', 'sms'].includes(c.channelType)),
    [channels]
  );

  // Auto-seleciona o único canal disponível e pula direto para o destinatário
  useEffect(() => {
    if (isOpen && step === 'channel' && !isLoadingChannels && initiableChannels.length === 1) {
      setSelectedChannel(initiableChannels[0]);
      setStep('recipient');
    }
  }, [isOpen, step, isLoadingChannels, initiableChannels]);

  const handleSelectChannel = (channel: MessagingChannel) => {
    setSelectedChannel(channel);
    setStep('recipient');
    setError(null);
  };

  const handleSelectContact = (contact: ContactSuggestion) => {
    setSelectedContact(contact);
    setContactName(contact.name);
    setPhoneNumber(contact.phone?.replace(/\D/g, '') || '');
    setContactSearch('');
    setContactSuggestions([]);
  };

  const handleClearContact = () => {
    setSelectedContact(null);
    setContactName('');
    setPhoneNumber('');
    setContactSearch('');
  };

  const handleBack = () => {
    if (step === 'recipient') setStep('channel');
    else if (step === 'template') setStep('recipient');
    else if (step === 'confirm') setStep('template');
    setError(null);
  };

  const handleContinue = () => {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setError('Número de telefone inválido (mínimo 10 dígitos)');
      return;
    }
    setStep('template');
    setError(null);
  };

  const handleTemplateStepContinue = () => {
    if (selectedTemplate && templateVars.length > 0) {
      const missing = templateVars.filter((v) => !templateVariables[v]?.trim());
      if (missing.length > 0) {
        setError('Preencha todas as variáveis do template antes de continuar.');
        return;
      }
    }
    setStep('confirm');
    setError(null);
  };

  const handleSkipTemplate = () => {
    setSelectedTemplate(null);
    setTemplateVariables({});
    setStep('confirm');
    setError(null);
  };

  const handleCreate = async () => {
    if (!selectedChannel) return;
    setIsCreating(true);
    setError(null);
    try {
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      const conversationId = await onCreateConversation({
        channelId: selectedChannel.id,
        phoneNumber: cleanPhone,
        contactName: contactName || undefined,
        contactId: selectedContact?.id,
      });

      // Envia o template após criar a conversa (falha silenciosa — conversa já foi criada)
      if (conversationId && selectedTemplate) {
        const bodyParams = templateVars.map((v) => ({
          type: 'text' as const,
          text: templateVariables[v] || '',
        }));
        try {
          await sendTemplateMutateAsync({
            conversationId,
            templateId: selectedTemplate.id,
            parameters: bodyParams.length > 0 ? { body: bodyParams } : undefined,
          });
        } catch {
          // Usuário pode reenviar o template manualmente na tela de conversa
        }
      }

      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar conversa');
    } finally {
      setIsCreating(false);
    }
  };

  const formatPhone = (value: string) => {
    const clean = value.replace(/\D/g, '');
    if (clean.length <= 2) return clean;
    if (clean.length <= 7) return `(${clean.slice(0, 2)}) ${clean.slice(2)}`;
    if (clean.length <= 11) return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7, 11)}`;
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Nova Conversa" size="md">
      <div className="space-y-4">
        {/* Indicador de etapas */}
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className={cn(step === 'channel' && 'text-primary-600 font-medium')}>1. Canal</span>
          <ChevronRight className="w-3 h-3" />
          <span className={cn(step === 'recipient' && 'text-primary-600 font-medium')}>2. Destinatário</span>
          <ChevronRight className="w-3 h-3" />
          <span className={cn(step === 'template' && 'text-primary-600 font-medium')}>3. Template</span>
          <ChevronRight className="w-3 h-3" />
          <span className={cn(step === 'confirm' && 'text-primary-600 font-medium')}>4. Confirmar</span>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Etapa 1: Selecionar canal */}
        {step === 'channel' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Selecione um canal para iniciar a conversa:
            </p>
            {isLoadingChannels ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
              </div>
            ) : initiableChannels.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum canal conectado.</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  Configure um canal WhatsApp ou SMS nas configurações.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {initiableChannels.map((channel) => (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => handleSelectChannel(channel)}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left',
                      'border-slate-200 dark:border-white/10',
                      'hover:bg-slate-50 dark:hover:bg-white/5',
                      'focus:outline-none focus:ring-2 focus:ring-primary-500'
                    )}
                  >
                    <ChannelIndicator type={channel.channelType as ChannelType} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{channel.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{channel.externalIdentifier}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Etapa 2: Destinatário */}
        {step === 'recipient' && selectedChannel && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-black/20">
              <ChannelIndicator type={selectedChannel.channelType as ChannelType} size="sm" />
              <span className="text-sm text-slate-700 dark:text-slate-300">{selectedChannel.name}</span>
            </div>

            {selectedContact ? (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-primary-50 dark:bg-primary-500/10 border border-primary-200 dark:border-primary-500/20">
                <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-500/20 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{selectedContact.name}</p>
                  {selectedContact.phone && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">{formatPhone(selectedContact.phone)}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleClearContact}
                  className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Buscar contato
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      placeholder="Nome ou telefone do contato..."
                      className={cn(
                        'w-full pl-10 pr-4 py-2.5 rounded-lg border',
                        'bg-white dark:bg-black/20',
                        'border-slate-200 dark:border-white/10',
                        'text-slate-900 dark:text-white',
                        'focus:outline-none focus:ring-2 focus:ring-primary-500'
                      )}
                      autoFocus
                    />
                    {isSearching && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
                    )}
                  </div>

                  {contactSuggestions.length > 0 && (
                    <div className="border border-slate-200 dark:border-white/10 rounded-lg overflow-hidden divide-y divide-slate-100 dark:divide-white/5">
                      {contactSuggestions.map((contact) => (
                        <button
                          key={contact.id}
                          type="button"
                          onClick={() => handleSelectContact(contact)}
                          className="w-full flex items-center gap-3 p-2.5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-left"
                        >
                          <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center flex-shrink-0">
                            <User className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{contact.name}</p>
                            {contact.phone && (
                              <p className="text-xs text-slate-500 dark:text-slate-400">{formatPhone(contact.phone)}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {contactSearch.length >= 2 && !isSearching && contactSuggestions.length === 0 && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 px-1">
                      Nenhum contato encontrado. Preencha o número abaixo.
                    </p>
                  )}
                </div>

                <div className="relative flex items-center gap-2">
                  <div className="flex-1 h-px bg-slate-200 dark:bg-white/10" />
                  <span className="text-xs text-slate-400 dark:text-slate-500">ou</span>
                  <div className="flex-1 h-px bg-slate-200 dark:bg-white/10" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Número de telefone <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="tel"
                      value={formatPhone(phoneNumber)}
                      onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                      placeholder="(11) 99999-9999"
                      className={cn(
                        'w-full pl-10 pr-4 py-2.5 rounded-lg border',
                        'bg-white dark:bg-black/20',
                        'border-slate-200 dark:border-white/10',
                        'text-slate-900 dark:text-white',
                        'focus:outline-none focus:ring-2 focus:ring-primary-500'
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Nome <span className="text-slate-400">(opcional)</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="João Silva"
                      className={cn(
                        'w-full pl-10 pr-4 py-2.5 rounded-lg border',
                        'bg-white dark:bg-black/20',
                        'border-slate-200 dark:border-white/10',
                        'text-slate-900 dark:text-white',
                        'focus:outline-none focus:ring-2 focus:ring-primary-500'
                      )}
                    />
                  </div>
                </div>
              </div>
            )}

            {selectedContact && !selectedContact.phone && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Número de telefone <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="tel"
                    value={formatPhone(phoneNumber)}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                    placeholder="(11) 99999-9999"
                    className={cn(
                      'w-full pl-10 pr-4 py-2.5 rounded-lg border',
                      'bg-white dark:bg-black/20',
                      'border-slate-200 dark:border-white/10',
                      'text-slate-900 dark:text-white',
                      'focus:outline-none focus:ring-2 focus:ring-primary-500'
                    )}
                    autoFocus
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Etapa 3: Template (opcional) */}
        {step === 'template' && selectedChannel && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Selecione um template para enviar ao contato (opcional):
            </p>

            {isLoadingTemplates ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-6">
                <FileText className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum template aprovado.</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  A conversa será criada sem envio de template.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSelectedTemplate(selectedTemplate?.id === t.id ? null : t);
                      setTemplateVariables({});
                      setError(null);
                    }}
                    className={cn(
                      'w-full text-left p-3 rounded-lg border transition-colors',
                      selectedTemplate?.id === t.id
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <FileText className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {t.displayName ?? t.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                          {templatePreview(t)}
                        </p>
                      </div>
                      {selectedTemplate?.id === t.id && (
                        <CheckCircle2 className="w-4 h-4 text-primary-500 flex-shrink-0 mt-0.5" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Variáveis do template selecionado */}
            {selectedTemplate && templateVars.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-white/10">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Preencha as variáveis:
                </p>
                {templateVars.map((varNum) => (
                  <div key={varNum} className="space-y-1">
                    <label className="text-xs text-slate-500 dark:text-slate-400 block capitalize">
                      {varLabel(bodyText, varNum)}
                    </label>
                    <input
                      type="text"
                      value={templateVariables[varNum] || ''}
                      onChange={(e) =>
                        setTemplateVariables((prev) => ({ ...prev, [varNum]: e.target.value }))
                      }
                      placeholder={`Valor para "${varLabel(bodyText, varNum)}"`}
                      className={cn(
                        'w-full px-3 py-2 text-sm rounded-lg border',
                        'bg-white dark:bg-black/20',
                        'border-slate-200 dark:border-white/10',
                        'text-slate-900 dark:text-white',
                        'focus:outline-none focus:ring-2 focus:ring-primary-500'
                      )}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Etapa 4: Confirmar */}
        {step === 'confirm' && selectedChannel && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10">
              <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-3">
                Confirmar nova conversa
              </h4>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Canal:</dt>
                  <dd className="text-slate-900 dark:text-white font-medium flex items-center gap-1.5">
                    <ChannelIndicator type={selectedChannel.channelType as ChannelType} size="sm" />
                    {selectedChannel.name}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Telefone:</dt>
                  <dd className="text-slate-900 dark:text-white font-medium">{formatPhone(phoneNumber)}</dd>
                </div>
                {contactName && (
                  <div className="flex justify-between">
                    <dt className="text-slate-500 dark:text-slate-400">Nome:</dt>
                    <dd className="text-slate-900 dark:text-white font-medium">{contactName}</dd>
                  </div>
                )}
                {selectedContact && (
                  <div className="flex justify-between">
                    <dt className="text-slate-500 dark:text-slate-400">Contato vinculado:</dt>
                    <dd className="text-primary-600 dark:text-primary-400 font-medium">Sim</dd>
                  </div>
                )}
                {selectedTemplate ? (
                  <div className="flex justify-between">
                    <dt className="text-slate-500 dark:text-slate-400">Template:</dt>
                    <dd className="text-slate-900 dark:text-white font-medium truncate max-w-[160px]">
                      {selectedTemplate.displayName ?? selectedTemplate.name}
                    </dd>
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <dt className="text-slate-500 dark:text-slate-400">Template:</dt>
                    <dd className="text-slate-400 dark:text-slate-500">Nenhum</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        )}

        {/* Ações */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-white/10">
          <button
            type="button"
            onClick={step === 'channel' ? handleClose : handleBack}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            {step === 'channel' ? 'Cancelar' : 'Voltar'}
          </button>

          {step === 'recipient' && (
            <button
              type="button"
              onClick={handleContinue}
              disabled={phoneNumber.replace(/\D/g, '').length < 10 && !selectedContact?.phone}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold',
                'bg-primary-600 text-white hover:bg-primary-700',
                'disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
              )}
            >
              Continuar
              <ChevronRight className="w-4 h-4" />
            </button>
          )}

          {step === 'template' && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSkipTemplate}
                className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 underline transition-colors"
              >
                Pular etapa
              </button>
              <button
                type="button"
                onClick={handleTemplateStepContinue}
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold',
                  'bg-primary-600 text-white hover:bg-primary-700',
                  'transition-colors'
                )}
              >
                Continuar
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {step === 'confirm' && (
            <button
              type="button"
              onClick={handleCreate}
              disabled={isCreating}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold',
                'bg-primary-600 text-white hover:bg-primary-700',
                'disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
              )}
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Criando...
                </>
              ) : selectedTemplate ? (
                <>
                  <Send className="w-4 h-4" />
                  Criar e Enviar Template
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Iniciar Conversa
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default NewConversationModal;
