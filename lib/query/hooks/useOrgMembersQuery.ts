/**
 * @fileoverview Org Members Query Hook
 *
 * Lista membros da organização para uso em dropdowns/filtros.
 * staleTime alto (5min) pois profiles mudam raramente.
 *
 * @module lib/query/hooks/useOrgMembersQuery
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { queryKeys } from '../queryKeys';
import { supabase } from '@/lib/supabase';

export interface OrgMember {
  id: string;
  name: string;
  status: 'online' | 'away' | 'busy';
}

export function useOrgMembersQuery() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: queryKeys.orgMembers.list(orgId ?? ''),
    queryFn: async (): Promise<OrgMember[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, status')
        .eq('organization_id', orgId!)
        .order('name');

      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id,
        name: p.name ?? 'Sem nome',
        status: (p.status as OrgMember['status']) ?? 'online',
      }));
    },
    enabled: !!orgId,
    staleTime: 30_000, // 30s — status muda com frequência
    gcTime: 5 * 60 * 1000,
  });
}
