import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../index';
import { useAuth } from '@/context/AuthContext';
import { getClient } from '@/lib/supabase/client';

export interface ContactNote {
  id: string;
  contactId: string;
  content: string;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

export function useContactNotes(contactId: string | undefined) {
  const { user, organizationId } = useAuth();

  return useQuery({
    queryKey: queryKeys.contactNotes.byContact(contactId ?? ''),
    enabled: !!contactId && !!user,
    queryFn: async (): Promise<ContactNote[]> => {
      const sb = getClient();
      const { data, error } = await sb
        .from('contact_notes')
        .select('id, contact_id, content, created_by, created_at, profiles:created_by(full_name)')
        .eq('contact_id', contactId!)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        contactId: r.contact_id as string,
        content: r.content as string,
        createdBy: r.created_by as string | null,
        createdByName: ((r.profiles as Record<string, unknown> | null)?.full_name as string) ?? null,
        createdAt: r.created_at as string,
      }));
    },
  });
}

export function useCreateContactNote() {
  const queryClient = useQueryClient();
  const { user, organizationId } = useAuth();

  return useMutation({
    mutationFn: async ({ contactId, content }: { contactId: string; content: string }) => {
      const sb = getClient();
      const { data, error } = await sb
        .from('contact_notes')
        .insert({ contact_id: contactId, content, organization_id: organizationId, created_by: user?.id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { contactId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contactNotes.byContact(contactId) });
    },
  });
}

export function useDeleteContactNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ noteId, contactId }: { noteId: string; contactId: string }) => {
      const sb = getClient();
      const { error } = await sb.from('contact_notes').delete().eq('id', noteId);
      if (error) throw error;
      return { noteId, contactId };
    },
    onSuccess: (_data, { contactId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contactNotes.byContact(contactId) });
    },
  });
}
