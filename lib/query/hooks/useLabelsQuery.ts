import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../index';
import { useAuth } from '@/context/AuthContext';
import { getClient } from '@/lib/supabase/client';

export interface Label {
  id: string;
  name: string;
  color: string;
}

export function useLabels() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.labels.all,
    enabled: !!user,
    queryFn: async (): Promise<Label[]> => {
      const sb = getClient();
      const { data, error } = await sb
        .from('labels')
        .select('id, name, color')
        .order('name');
      if (error) throw error;
      return (data ?? []) as Label[];
    },
  });
}

export function useContactLabels(contactId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.labels.byContact(contactId ?? ''),
    enabled: !!contactId && !!user,
    queryFn: async (): Promise<Label[]> => {
      const sb = getClient();
      const { data, error } = await sb
        .from('contact_labels')
        .select('label:label_id(id, name, color)')
        .eq('contact_id', contactId!);
      if (error) throw error;
      return (data ?? []).map((r: Record<string, unknown>) => r.label as Label);
    },
  });
}

export function useAssignLabel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contactId, labelId }: { contactId: string; labelId: string }) => {
      const sb = getClient();
      const { error } = await sb
        .from('contact_labels')
        .insert({ contact_id: contactId, label_id: labelId });
      if (error) throw error;
    },
    onSuccess: (_data, { contactId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.labels.byContact(contactId) });
    },
  });
}

export function useRemoveLabel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contactId, labelId }: { contactId: string; labelId: string }) => {
      const sb = getClient();
      const { error } = await sb
        .from('contact_labels')
        .delete()
        .eq('contact_id', contactId)
        .eq('label_id', labelId);
      if (error) throw error;
    },
    onSuccess: (_data, { contactId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.labels.byContact(contactId) });
    },
  });
}

export function useCreateLabel() {
  const queryClient = useQueryClient();
  const { organizationId } = useAuth();

  return useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const sb = getClient();
      const { data, error } = await sb
        .from('labels')
        .insert({ name, color, organization_id: organizationId })
        .select()
        .single();
      if (error) throw error;
      return data as Label;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.labels.all });
    },
  });
}

export function useDeleteLabel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (labelId: string) => {
      const sb = getClient();
      const { error } = await sb.from('labels').delete().eq('id', labelId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.labels.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.labels.all });
    },
  });
}
