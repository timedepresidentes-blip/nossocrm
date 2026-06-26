'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { sanitizePostgrestValue } from '@/lib/utils/sanitize';

export interface MessageSearchResult {
  conversationId: string;
  messageId: string;
  snippet: string;
  createdAt: string;
  contactName: string | null;
}

export function useMessageSearch(query: string) {
  const { profile, user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['messageSearch', query, profile?.organization_id],
    queryFn: async (): Promise<MessageSearchResult[]> => {
      const safe = sanitizePostgrestValue(query.trim());
      if (!safe) return [];

      const { data, error } = await supabase
        .from('messaging_messages')
        .select(`
          id,
          conversation_id,
          content,
          created_at,
          conversation:messaging_conversations!conversation_id (
            contact:contacts!contact_id ( name )
          )
        `)
        .filter('content->>text', 'ilike', `%${safe}%`)
        .order('created_at', { ascending: false })
        .limit(25);

      if (error) throw error;

      return (data || []).map((row: any) => ({
        conversationId: row.conversation_id,
        messageId: row.id,
        snippet: (row.content?.text as string) || '',
        createdAt: row.created_at,
        contactName: row.conversation?.contact?.name || null,
      }));
    },
    enabled: !authLoading && !!user && !!profile?.organization_id && query.trim().length >= 2,
    staleTime: 5_000,
  });
}

export function useChannelTypeOptions() {
  const { profile, user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['channelTypeOptions', profile?.organization_id],
    queryFn: async (): Promise<{ type: string; label: string }[]> => {
      const { data } = await supabase
        .from('messaging_channels')
        .select('channel_type, name')
        .eq('organization_id', profile!.organization_id!)
        .is('deleted_at', null);

      const LABELS: Record<string, string> = {
        whatsapp: 'WhatsApp',
        instagram: 'Instagram',
        email: 'Email',
        sms: 'SMS',
        telegram: 'Telegram',
        voice: 'Voz',
      };

      const unique = [...new Set((data || []).map((r: any) => r.channel_type as string))];
      return unique.sort().map(t => ({ type: t, label: LABELS[t] ?? t }));
    },
    enabled: !authLoading && !!user && !!profile?.organization_id,
    staleTime: 60_000,
  });
}

export function useSourceOptions() {
  const { profile, user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['sourceOptions', profile?.organization_id],
    queryFn: async (): Promise<string[]> => {
      const { data } = await supabase
        .from('contacts')
        .select('source')
        .eq('organization_id', profile!.organization_id)
        .not('source', 'is', null)
        .neq('source', '');

      const unique = [...new Set((data || []).map((r: any) => r.source as string).filter(Boolean))];
      return unique.sort();
    },
    enabled: !authLoading && !!user && !!profile?.organization_id,
    staleTime: 60_000,
  });
}
