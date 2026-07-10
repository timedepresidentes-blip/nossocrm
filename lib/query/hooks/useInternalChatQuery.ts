'use client';

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getClient } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';

export interface InternalChatMessage {
  id: string;
  orgId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  content: string;
  createdAt: string;
}

const PAGE_SIZE = 40;

function rowToMsg(row: Record<string, unknown>): InternalChatMessage {
  const sender = row.sender as Record<string, unknown> | null;
  const name =
    (sender?.nickname as string | null) ||
    [(sender?.first_name as string | null), (sender?.last_name as string | null)]
      .filter(Boolean).join(' ') ||
    'Atendente';
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    senderId: row.sender_id as string,
    senderName: name,
    senderAvatar: (sender?.avatar_url as string | null) ?? null,
    content: row.content as string,
    createdAt: row.created_at as string,
  };
}

export function useInternalChat(orgId: string | null) {
  return useQuery({
    queryKey: ['internal_chat', orgId],
    enabled: !!orgId,
    staleTime: 30_000,
    queryFn: async () => {
      const sb = getClient();
      const { data, error } = await sb
        .from('internal_chat_messages')
        .select('*, sender:profiles(first_name, last_name, nickname, avatar_url)')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: true })
        .limit(PAGE_SIZE);
      if (error) throw error;
      return (data as unknown as Record<string, unknown>[]).map(rowToMsg);
    },
  });
}

export function useSendInternalMessage() {
  const { organizationId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) => {
      const sb = getClient();
      const { error } = await sb
        .from('internal_chat_messages')
        .insert({ org_id: organizationId, content });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['internal_chat', organizationId] });
    },
  });
}

// Hook de realtime — adiciona novas mensagens ao cache sem refetch completo
export function useInternalChatRealtime(orgId: string | null) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!orgId) return;
    const sb = getClient();
    const channel = sb
      .channel(`internal_chat:${orgId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'internal_chat_messages', filter: `org_id=eq.${orgId}` },
        async (payload) => {
          // Busca o sender para ter o nome
          const { data: sender } = await sb
            .from('profiles')
            .select('first_name, last_name, nickname, avatar_url')
            .eq('id', (payload.new as Record<string, unknown>).sender_id as string)
            .maybeSingle();

          const newMsg = rowToMsg({ ...payload.new as Record<string, unknown>, sender });
          queryClient.setQueryData<InternalChatMessage[]>(
            ['internal_chat', orgId],
            (old) => {
              if (!old) return [newMsg];
              if (old.some((m) => m.id === newMsg.id)) return old;
              return [...old, newMsg];
            }
          );
        }
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [orgId, queryClient]);
}
