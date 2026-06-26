'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { getClient } from '@/lib/supabase/client';

export interface ScheduledMessage {
  id: string;
  organizationId: string;
  conversationId: string | null;
  channelId: string | null;
  externalContactId: string;
  contactName: string | null;
  message: string;
  scheduledAt: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  sentAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface CreateScheduledMessageInput {
  conversationId: string | null;
  channelId: string | null;
  externalContactId: string;
  contactName?: string;
  message: string;
  scheduledAt: string;
}

const QUERY_KEY = 'scheduled_messages';

export function useScheduledMessagesQuery(conversationId?: string) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const supabase = getClient();

  return useQuery({
    queryKey: [QUERY_KEY, orgId, conversationId],
    queryFn: async (): Promise<ScheduledMessage[]> => {
      let q = supabase
        .from('scheduled_messages')
        .select('*')
        .eq('organization_id', orgId!)
        .order('scheduled_at', { ascending: true });

      if (conversationId) {
        q = q.eq('conversation_id', conversationId);
      }

      const { data, error } = await q;
      if (error) throw error;

      return (data ?? []).map((r) => ({
        id: r.id,
        organizationId: r.organization_id,
        conversationId: r.conversation_id,
        channelId: r.channel_id,
        externalContactId: r.external_contact_id,
        contactName: r.contact_name,
        message: r.message,
        scheduledAt: r.scheduled_at,
        status: r.status,
        sentAt: r.sent_at,
        errorMessage: r.error_message,
        createdAt: r.created_at,
      }));
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });
}

export function useCreateScheduledMessage() {
  const { profile, user } = useAuth();
  const qc = useQueryClient();
  const supabase = getClient();

  return useMutation({
    mutationFn: async (input: CreateScheduledMessageInput) => {
      const { error, data } = await supabase.from('scheduled_messages').insert({
        organization_id: profile!.organization_id,
        conversation_id: input.conversationId,
        channel_id: input.channelId,
        external_contact_id: input.externalContactId,
        contact_name: input.contactName ?? null,
        message: input.message,
        scheduled_at: input.scheduledAt,
        created_by: user?.id,
      }).select().single();
      if (error) throw error;

      // Aplica etiqueta "Standby" ao contato da conversa após agendar
      if (input.conversationId) {
        const { data: conv } = await supabase
          .from('messaging_conversations')
          .select('contact_id')
          .eq('id', input.conversationId)
          .maybeSingle();

        if (conv?.contact_id) {
          const { data: standbyLabel } = await supabase
            .from('labels')
            .select('id')
            .eq('organization_id', profile!.organization_id!)
            .eq('name', 'Standby')
            .maybeSingle();

          if (standbyLabel?.id) {
            await supabase
              .from('contact_labels')
              .upsert(
                { contact_id: conv.contact_id, label_id: standbyLabel.id },
                { onConflict: 'contact_id,label_id', ignoreDuplicates: true }
              );
          }
        }
      }

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, profile?.organization_id] });
      qc.invalidateQueries({ queryKey: ['messagingConversations'], exact: false });
    },
  });
}

export function useCancelScheduledMessage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const supabase = getClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('scheduled_messages')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .eq('status', 'pending');
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, profile?.organization_id] });
    },
  });
}
