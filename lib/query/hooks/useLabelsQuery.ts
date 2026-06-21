import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../index';
import { useAuth } from '@/context/AuthContext';
import { getClient } from '@/lib/supabase/client';

export interface Label {
  id: string;
  name: string;
  color: string;
  stageId?: string | null;
  syncsWithLost?: boolean;
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
        .select('id, name, color, stage_id, syncs_with_lost')
        .order('name');
      if (error) throw error;
      return (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        name: r.name as string,
        color: r.color as string,
        stageId: r.stage_id as string | null,
        syncsWithLost: r.syncs_with_lost as boolean | undefined,
      }));
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
        .select('label:label_id(id, name, color, syncs_with_lost)')
        .eq('contact_id', contactId!);
      if (error) throw error;
      return (data ?? []).map((r: Record<string, unknown>) => {
        const label = r.label as Record<string, unknown>;
        return {
          id: label.id as string,
          name: label.name as string,
          color: label.color as string,
          syncsWithLost: label.syncs_with_lost as boolean | undefined,
        };
      });
    },
  });
}

export function useAssignLabel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contactId, labelId }: { contactId: string; labelId: string }) => {
      const sb = getClient();

      // Insere a etiqueta (ignora duplicata)
      const { error } = await sb
        .from('contact_labels')
        .insert({ contact_id: contactId, label_id: labelId });
      if (error && error.code !== '23505') throw error;

      // Busca dados da etiqueta para verificar sincronizações
      const { data: labelData } = await sb
        .from('labels')
        .select('stage_id, syncs_with_lost')
        .eq('id', labelId)
        .single();

      // Busca deals ativos via conversas deste contato (usado em ambas sincronizações)
      const fetchDealIds = async () => {
        const { data: convs } = await sb
          .from('messaging_conversations')
          .select('metadata')
          .eq('contact_id', contactId)
          .eq('status', 'open');
        return (convs ?? [])
          .map((c: Record<string, unknown>) => ((c.metadata as Record<string, unknown>)?.deal_id as string | undefined))
          .filter((id): id is string => Boolean(id));
      };

      // Sincroniza pipeline: move deal para estágio da etiqueta
      if (labelData?.stage_id) {
        const dealIds = await fetchDealIds();
        if (dealIds.length > 0) {
          await sb
            .from('deals')
            .update({ stage_id: labelData.stage_id, updated_at: new Date().toISOString() })
            .in('id', dealIds);
        }
      }

      // Sincroniza perdido: marca deal como is_lost quando etiqueta "Perdido" é atribuída
      if (labelData?.syncs_with_lost) {
        const dealIds = await fetchDealIds();
        if (dealIds.length > 0) {
          await sb
            .from('deals')
            .update({
              is_lost: true,
              is_won: false,
              closed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .in('id', dealIds);
        }
      }
    },
    onSuccess: (_data, { contactId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.labels.byContact(contactId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.all });
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
    },
  });
}
