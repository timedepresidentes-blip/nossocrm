'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { getClient } from '@/lib/supabase/client';

export interface Campaign {
  id: string;
  name: string;
  message: string;
  channelId: string | null;
  status: 'draft' | 'running' | 'completed' | 'cancelled';
  totalCount: number;
  sentCount: number;
  failedCount: number;
  sourceFilters: Record<string, unknown>;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface CampaignRecipient {
  id: string;
  contactId: string | null;
  dealId: string | null;
  conversationId: string | null;
  externalContactId: string;
  contactName: string | null;
  dealTitle: string | null;
  stageName: string | null;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  sentAt: string | null;
  errorMessage: string | null;
}

// Negócio parado com info do contato para seleção de campanha
export interface StalledDeal {
  dealId: string;
  dealTitle: string;
  stageId: string;
  stageName: string;
  stageColor: string;
  contactId: string;
  contactName: string;
  phone: string | null;
  conversationExternalId: string | null;
  conversationId: string | null;
  channelId: string | null;
  daysSinceUpdate: number;
  hasWhatsApp: boolean;
}

const QUERY_KEY = 'campaigns';

export function useCampaignsQuery() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const supabase = getClient();

  return useQuery({
    queryKey: [QUERY_KEY, orgId],
    queryFn: async (): Promise<Campaign[]> => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        message: r.message,
        channelId: r.channel_id,
        status: r.status,
        totalCount: r.total_count,
        sentCount: r.sent_count,
        failedCount: r.failed_count,
        sourceFilters: r.source_filters ?? {},
        createdAt: r.created_at,
        startedAt: r.started_at,
        completedAt: r.completed_at,
      }));
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });
}

export function useCampaignRecipientsQuery(campaignId: string | null) {
  const { profile } = useAuth();
  const supabase = getClient();

  return useQuery({
    queryKey: [QUERY_KEY, 'recipients', campaignId],
    queryFn: async (): Promise<CampaignRecipient[]> => {
      const { data, error } = await supabase
        .from('campaign_recipients')
        .select('*')
        .eq('campaign_id', campaignId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        contactId: r.contact_id,
        dealId: r.deal_id,
        conversationId: r.conversation_id,
        externalContactId: r.external_contact_id,
        contactName: r.contact_name,
        dealTitle: r.deal_title,
        stageName: r.stage_name,
        status: r.status,
        sentAt: r.sent_at,
        errorMessage: r.error_message,
      }));
    },
    enabled: !!campaignId,
    staleTime: 10_000,
    refetchInterval: (q) => {
      // Atualiza a cada 2s enquanto campanha está rodando
      const data = q.state.data;
      if (!data) return false;
      const hasPending = data.some((r) => r.status === 'pending');
      return hasPending ? 2000 : false;
    },
  });
}

// Busca negócios parados do pipeline para seleção de campanha
export function useStalledDealsQuery(
  boardId: string | null,
  stalledDays: number,
  stageIds: string[]
) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const supabase = getClient();

  return useQuery({
    queryKey: ['stalled_deals', orgId, boardId, stalledDays, stageIds],
    queryFn: async (): Promise<StalledDeal[]> => {
      const cutoff = new Date(Date.now() - stalledDays * 24 * 60 * 60 * 1000).toISOString();

      let q = supabase
        .from('deals')
        .select(`
          id, title, stage_id, updated_at,
          contact:contacts(id, name, phone),
          stage:board_stages(id, name, color)
        `)
        .eq('organization_id', orgId!)
        .eq('board_id', boardId!)
        .eq('is_won', false)
        .eq('is_lost', false)
        .lte('updated_at', cutoff)
        .not('contact_id', 'is', null)
        .order('updated_at', { ascending: true })
        .limit(200);

      if (stageIds.length > 0) {
        q = q.in('stage_id', stageIds);
      }

      const { data: deals, error } = await q;
      if (error) throw error;
      if (!deals || deals.length === 0) return [];

      // Verifica conversas WhatsApp existentes para os contatos
      const contactIds = deals
        .map((d) => {
          const c = d.contact as unknown as { id: string } | { id: string }[] | null;
          if (!c) return undefined;
          return Array.isArray(c) ? c[0]?.id : c.id;
        })
        .filter(Boolean) as string[];

      const { data: convs } = await supabase
        .from('messaging_conversations')
        .select('contact_id, id, external_contact_id, channel_id')
        .eq('organization_id', orgId!)
        .in('contact_id', contactIds)
        .eq('status', 'open')
        .order('last_message_at', { ascending: false });

      // Mapeia contact_id → conversa mais recente
      const convByContact = new Map<string, { id: string; extId: string; channelId: string }>();
      for (const c of convs ?? []) {
        if (!convByContact.has(c.contact_id)) {
          convByContact.set(c.contact_id, {
            id: c.id,
            extId: c.external_contact_id,
            channelId: c.channel_id,
          });
        }
      }

      const now = Date.now();
      return deals.map((d) => {
        const cr = d.contact as unknown as { id: string; name: string; phone: string | null } | { id: string; name: string; phone: string | null }[] | null;
        const contact = Array.isArray(cr) ? cr[0] ?? null : cr;
        const sr = d.stage as unknown as { id: string; name: string; color: string } | { id: string; name: string; color: string }[] | null;
        const stage = Array.isArray(sr) ? sr[0] ?? null : sr;
        const conv = contact ? convByContact.get(contact.id) : undefined;
        const phone = conv?.extId ?? contact?.phone ?? null;
        const daysSince = Math.floor((now - new Date(d.updated_at).getTime()) / 86400000);

        return {
          dealId: d.id,
          dealTitle: d.title,
          stageId: d.stage_id,
          stageName: stage?.name ?? '',
          stageColor: stage?.color ?? '#6366f1',
          contactId: contact?.id ?? '',
          contactName: contact?.name ?? 'Sem nome',
          phone: contact?.phone ?? null,
          conversationExternalId: conv?.extId ?? null,
          conversationId: conv?.id ?? null,
          channelId: conv?.channelId ?? null,
          daysSinceUpdate: daysSince,
          hasWhatsApp: !!phone,
        };
      });
    },
    enabled: !!orgId && !!boardId && stalledDays > 0,
    staleTime: 60_000,
  });
}
