'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { getClient } from '@/lib/supabase/client';

export interface QuickReply {
  id: string;
  shortcut: string;
  title: string;
  content: string;
  createdAt: string;
}

const QR_KEY = ['quick_replies'];

export function useQuickReplies() {
  const { user, organizationId } = useAuth();

  return useQuery({
    queryKey: QR_KEY,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<QuickReply[]> => {
      const sb = getClient();
      const { data, error } = await sb
        .from('quick_replies')
        .select('*')
        .order('shortcut', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(r => ({
        id: r.id,
        shortcut: r.shortcut,
        title: r.title,
        content: r.content,
        createdAt: r.created_at,
      }));
    },
  });
}

export function useCreateQuickReply() {
  const qc = useQueryClient();
  const { user, organizationId } = useAuth();

  return useMutation({
    mutationFn: async (input: { shortcut: string; title: string; content: string }) => {
      const sb = getClient();
      const { error } = await sb.from('quick_replies').insert({
        organization_id: organizationId,
        shortcut: input.shortcut.replace(/^\//, '').toLowerCase(),
        title: input.title,
        content: input.content,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QR_KEY }),
  });
}

export function useUpdateQuickReply() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; shortcut: string; title: string; content: string }) => {
      const sb = getClient();
      const { error } = await sb
        .from('quick_replies')
        .update({
          shortcut: input.shortcut.replace(/^\//, '').toLowerCase(),
          title: input.title,
          content: input.content,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QR_KEY }),
  });
}

export function useDeleteQuickReply() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const sb = getClient();
      const { error } = await sb.from('quick_replies').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QR_KEY }),
  });
}
