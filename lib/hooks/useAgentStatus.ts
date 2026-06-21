'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { getClient } from '@/lib/supabase/client';
import { queryKeys } from '@/lib/query/queryKeys';

export type AgentStatus = 'online' | 'away' | 'busy';

export const STATUS_CONFIG: Record<AgentStatus, { label: string; color: string; dot: string }> = {
  online: { label: 'Online',   color: 'text-green-600 dark:text-green-400', dot: 'bg-green-500' },
  away:   { label: 'Ausente',  color: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  busy:   { label: 'Ocupado',  color: 'text-red-600 dark:text-red-400',     dot: 'bg-red-500'   },
};

export function useMyStatus() {
  const { profile, user } = useAuth();
  const qc = useQueryClient();
  const supabase = getClient();

  const currentStatus: AgentStatus = (profile?.status as AgentStatus) ?? 'online';

  const mutation = useMutation({
    mutationFn: async (status: AgentStatus) => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      const { error } = await supabase
        .from('profiles')
        .update({ status })
        .eq('id', user.id);
      if (error) throw error;
      return status;
    },
    onSuccess: (_status, vars) => {
      // Invalida membros da org para que a lista de status atualize
      if (profile?.organization_id) {
        qc.invalidateQueries({ queryKey: queryKeys.orgMembers.list(profile.organization_id) });
      }
    },
  });

  return { status: currentStatus, setStatus: mutation.mutateAsync, isPending: mutation.isPending };
}

// Assinatura realtime: escuta mudanças de status dos membros da org
export function useOrgStatusRealtime(orgId: string | undefined) {
  const qc = useQueryClient();
  const supabase = getClient();

  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`org-profiles-status-${orgId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: queryKeys.orgMembers.list(orgId) });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, qc, supabase]);
}
