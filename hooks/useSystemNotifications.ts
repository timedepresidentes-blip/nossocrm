import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useMemo, useEffect } from 'react';

export interface SystemNotification {
    id: string;
    type: string;
    title: string;
    message: string;
    timestamp: Date;
    actionLink?: string;
    severity: 'high' | 'medium' | 'low';
    readAt?: string | null;
}

export const useSystemNotifications = () => {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const sb = supabase;

    const queryKey = ['system_notifications', user?.id];

    const { data: notifications = [] } = useQuery({
        queryKey,
        queryFn: async () => {
            if (!sb || !user) return [];

            const { data, error } = await sb
                .from('system_notifications')
                .select('*')
                // Mostra notificações da org toda (user_id IS NULL) + as direcionadas ao usuário
                .or(`user_id.is.null,user_id.eq.${user.id}`)
                .order('created_at', { ascending: false })
                .limit(30);

            if (error) throw error;

            type NotificationRow = {
                id: string;
                type: string;
                title: string;
                message: string;
                created_at: string;
                link?: string;
                severity: string;
                read_at?: string | null;
            };

            return (data as NotificationRow[]).map(n => ({
                id: n.id,
                type: n.type,
                title: n.title,
                message: n.message,
                timestamp: new Date(n.created_at),
                actionLink: n.link,
                severity: n.severity as 'high' | 'medium' | 'low',
                readAt: n.read_at
            }));
        },
        enabled: !!user && !!sb,
        staleTime: 1000 * 60 * 5,
    });

    // Realtime: atualiza instantaneamente quando uma nova notificação chega
    useEffect(() => {
        if (!sb || !user) return;

        const channel = sb
            .channel(`system_notifications:${user.id}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'system_notifications' },
                () => {
                    queryClient.invalidateQueries({ queryKey });
                }
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'system_notifications' },
                () => {
                    queryClient.invalidateQueries({ queryKey });
                }
            )
            .subscribe();

        return () => { sb.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    const unreadCount = useMemo(() =>
        notifications.filter(n => !n.readAt).length
    , [notifications]);

    const hasHighSeverity = useMemo(() =>
        notifications.some(n => n.severity === 'high' && !n.readAt)
    , [notifications]);

    const markAsRead = useMutation({
        mutationFn: async (id: string) => {
            if (!sb) throw new Error('Supabase não configurado');
            const { error } = await sb
                .from('system_notifications')
                .update({ read_at: new Date().toISOString() })
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey });
        }
    });

    const markAllAsRead = useMutation({
        mutationFn: async () => {
            if (!sb || !user) throw new Error('Supabase não configurado');
            const { error } = await sb
                .from('system_notifications')
                .update({ read_at: new Date().toISOString() })
                .is('read_at', null)
                .or(`user_id.is.null,user_id.eq.${user.id}`);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey });
        }
    });

    return {
        notifications,
        count: unreadCount,
        hasHighSeverity,
        markAsRead: markAsRead.mutate,
        markAllAsRead: markAllAsRead.mutate
    };
};
