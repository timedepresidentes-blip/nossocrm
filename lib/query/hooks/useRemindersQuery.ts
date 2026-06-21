import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../index';
import { useAuth } from '@/context/AuthContext';
import { getClient } from '@/lib/supabase/client';
import { startOfMonth, endOfMonth, subMinutes } from 'date-fns';

export type ReminderType = 'reminder' | 'meeting' | 'task' | 'call';

export interface CalendarReminder {
  id: string;
  title: string;
  notes?: string;
  type: ReminderType;
  scheduledAt: string;
  alarmMinutesBefore: number;
  contactId?: string;
  isDone: boolean;
  alertedAt?: string;
  userId: string;
  organizationId: string;
  createdAt: string;
}

function mapRow(r: Record<string, unknown>): CalendarReminder {
  return {
    id: r.id as string,
    title: r.title as string,
    notes: r.notes as string | undefined,
    type: (r.type as ReminderType) || 'reminder',
    scheduledAt: r.scheduled_at as string,
    alarmMinutesBefore: (r.alarm_minutes_before as number) ?? 15,
    contactId: r.contact_id as string | undefined,
    isDone: r.is_done as boolean,
    alertedAt: r.alerted_at as string | undefined,
    userId: r.user_id as string,
    organizationId: r.organization_id as string,
    createdAt: r.created_at as string,
  };
}

// Retorna lembretes de um mês específico (padrão: mês atual) — apenas do usuário logado
export function useReminders(month?: Date) {
  const { user } = useAuth();
  const ref = month || new Date();
  const year = ref.getFullYear();
  const monthIdx = ref.getMonth();

  return useQuery({
    queryKey: [...queryKeys.reminders.byMonth(year, monthIdx), user?.id],
    enabled: !!user,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<CalendarReminder[]> => {
      const sb = getClient();
      const from = startOfMonth(ref).toISOString();
      const to = endOfMonth(ref).toISOString();
      const { data, error } = await sb
        .from('calendar_reminders')
        .select('*')
        .eq('user_id', user!.id)   // ← apenas os lembretes do usuário logado
        .gte('scheduled_at', from)
        .lte('scheduled_at', to)
        .order('scheduled_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
  });
}

// Retorna lembretes pendentes cujo alarme já deveria ter disparado (para polling de alarme)
// Filtra pelo user_id para que cada usuário receba apenas seus próprios alertas
export function useDueReminders() {
  const { user } = useAuth();

  return useQuery({
    // user.id na key evita cache compartilhado entre usuários diferentes
    queryKey: [...queryKeys.reminders.due(), user?.id],
    enabled: !!user,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    queryFn: async (): Promise<CalendarReminder[]> => {
      const sb = getClient();
      const horizon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await sb
        .from('calendar_reminders')
        .select('*')
        .eq('user_id', user!.id)   // ← apenas os lembretes do usuário logado
        .eq('is_done', false)
        .is('alerted_at', null)
        .lte('scheduled_at', horizon)
        .order('scheduled_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
  });
}

// Retorna lembretes de um contato específico — apenas do usuário logado
export function useRemindersByContact(contactId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: [...queryKeys.reminders.byContact(contactId ?? ''), user?.id],
    enabled: !!user && !!contactId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<CalendarReminder[]> => {
      const sb = getClient();
      const { data, error } = await sb
        .from('calendar_reminders')
        .select('*')
        .eq('user_id', user!.id)   // ← apenas os lembretes do usuário logado
        .eq('contact_id', contactId!)
        .order('scheduled_at', { ascending: true })
        .limit(20);
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
  });
}

export function useCreateReminder() {
  const queryClient = useQueryClient();
  const { user, organizationId } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      title: string;
      notes?: string;
      type: ReminderType;
      scheduledAt: string;
      alarmMinutesBefore: number;
      contactId?: string;
    }) => {
      const sb = getClient();
      const { data, error } = await sb
        .from('calendar_reminders')
        .insert({
          title: input.title,
          notes: input.notes || null,
          type: input.type,
          scheduled_at: input.scheduledAt,
          alarm_minutes_before: input.alarmMinutesBefore,
          contact_id: input.contactId || null,
          user_id: user!.id,
          organization_id: organizationId,
        })
        .select()
        .single();
      if (error) throw error;
      return mapRow(data as Record<string, unknown>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reminders.all });
    },
  });
}

export function useUpdateReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: Partial<{
      title: string;
      notes: string;
      type: ReminderType;
      scheduledAt: string;
      alarmMinutesBefore: number;
      contactId: string;
      isDone: boolean;
    }> & { id: string }) => {
      const sb = getClient();
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (input.title !== undefined) updates.title = input.title;
      if (input.notes !== undefined) updates.notes = input.notes;
      if (input.type !== undefined) updates.type = input.type;
      if (input.scheduledAt !== undefined) updates.scheduled_at = input.scheduledAt;
      if (input.alarmMinutesBefore !== undefined) updates.alarm_minutes_before = input.alarmMinutesBefore;
      if (input.contactId !== undefined) updates.contact_id = input.contactId;
      if (input.isDone !== undefined) updates.is_done = input.isDone;

      const { error } = await sb
        .from('calendar_reminders')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reminders.all });
    },
  });
}

export function useMarkReminderAlerted() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const sb = getClient();
      const { error } = await sb
        .from('calendar_reminders')
        .update({ alerted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reminders.due() });
    },
  });
}

export function useDeleteReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const sb = getClient();
      const { error } = await sb
        .from('calendar_reminders')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reminders.all });
    },
  });
}
