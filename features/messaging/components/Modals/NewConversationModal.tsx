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
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import { useConnectedChannelsQuery } from '@/lib/query/hooks/useChannelsQuery';
import { ChannelIndicator } from '../ChannelIndicator';
import type { MessagingChannel, ChannelType } from '@/lib/messaging/types';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

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
  }) => Promise<void>;
  defaultContactId?: string;
  defaultContactName?: string;
  defaultContactPhone?: string;
}

type Step = 'channel' | 'recipient' | 'confirm';

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
    onClose();
  }, [onClose, defaultContactPhone, defaultContactName]);

  const initiableChannels = useMemo(
    () => channels.filter((c) => ['whatsapp', 'sms'].includes(c.channelType)),
    [channels]
  );

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
    else if (step === 'confirm') setStep('recipient');
    setError(null);
  };

  const handleContinue = () => {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setError('Número de telefone inválido (mínimo 10 dígitos)');
      return;
    }
    setStep('confirm');
    setError(null);
  };

  const handleCreate = async () => {
    if (!selectedChannel) return;
    setIsCreating(true);
    setError(null);
    try {
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      await onCreateConversation({
        channelId: selectedChannel.id,
        phoneNumber: cleanPhone,
        contactName: contactName || undefined,
        contactId: selectedContact?.id,
      });
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
        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className={cn(step === 'channel' && 'text-primary-600 font-medium')}>1. Canal</span>
          <ChevronRight className="w-3 h-3" />
          <span className={cn(step === 'recipient' && 'text-primary-600 font-medium')}>2. Destinatário</span>
          <ChevronRight className="w-3 h-3" />
          <span className={cn(step === 'confirm' && 'text-primary-600 font-medium')}>3. Confirmar</span>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Step 1: Select channel */}
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

        {/* Step 2: Enter recipient */}
        {step === 'recipient' && selectedChannel && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-black/20">
              <ChannelIndicator type={selectedChannel.channelType as ChannelType} size="sm" />
              <span className="text-sm text-slate-700 dark:text-slate-300">{selectedChannel.name}</span>
            </div>

            {selectedContact ? (
              /* Contato selecionado */
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
                {/* Busca de contatos existentes */}
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

                  {/* Sugestões de contatos */}
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

                {/* Número manual */}
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

                {/* Nome (opcional, só para número manual) */}
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

            {/* Se contato selecionado mas sem telefone */}
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

        {/* Step 3: Confirm */}
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
              </dl>
            </div>
          </div>
        )}

        {/* Actions */}
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
