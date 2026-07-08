'use client';

import React from 'react';
import { ArrowLeftRight, Bot, UserCheck } from 'lucide-react';
import { StatusDot } from '@/components/StatusPicker';
import type { AgentStatus } from '@/lib/hooks/useAgentStatus';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { useOrgMembersQuery } from '@/lib/query/hooks/useOrgMembersQuery';
import { useAssignConversation } from '@/lib/query/hooks/useConversationsQuery';
import { useToggleConversationAiPause } from '@/lib/query/hooks/useMessagingConversationsQuery';
import { useAuth } from '@/context/AuthContext';
import { getClient } from '@/lib/supabase/client';
import { useNotificationSound } from '@/lib/hooks/useNotificationSound';

interface TransferButtonProps {
  conversationId: string;
  assignedUserId?: string | null;
  conversationMetadata: Record<string, unknown>;
  assignedAt?: string;
  contactName?: string;
}

export function TransferButton({
  conversationId,
  assignedUserId,
  conversationMetadata,
  assignedAt,
  contactName,
}: TransferButtonProps) {
  const { profile, organizationId } = useAuth();
  const { data: members = [] } = useOrgMembersQuery();
  const assignMutation = useAssignConversation();
  const aiPauseMutation = useToggleConversationAiPause();
  const { play: playSound } = useNotificationSound();

  const isAiPaused =
    conversationMetadata?.ai_paused === true ||
    (conversationMetadata?.ai_paused !== false && !!assignedAt);

  const otherMembers = members.filter((m) => m.id !== profile?.id);

  // Notifica o atendente que recebeu: persiste no banco + broadcast realtime instantâneo
  const notifyReceiver = async (targetUserId: string, targetName: string) => {
    const sb = getClient();
    const senderName = profile?.nickname
      || (profile?.first_name ? `${profile.first_name}${profile.last_name ? ' ' + profile.last_name : ''}` : null)
      || profile?.email?.split('@')[0]
      || 'Atendente';
    const contact = contactName || 'um cliente';

    // Persiste no banco (aparece no sininho mesmo se receptor estiver offline)
    try {
      await sb.from('system_notifications').insert({
        organization_id: organizationId,
        user_id: targetUserId,
        type: 'CONVERSATION_TRANSFER',
        title: 'Conversa transferida para você',
        message: `${senderName} transferiu a conversa com ${contact} para ${targetName}.`,
        link: `/messaging?id=${conversationId}`,
        severity: 'medium',
      });
    } catch { /* best-effort */ }

    // Broadcast instantâneo para exibir toast ao receptor
    try {
      const ch = sb.channel(`org:${organizationId}:notifications`);
      await new Promise<void>((resolve) => {
        ch.subscribe((status) => { if (status === 'SUBSCRIBED') resolve(); });
      });
      ch.send({
        type: 'broadcast',
        event: 'conversation_transfer',
        payload: { conversationId, toUserId: targetUserId, fromName: senderName, contactName: contact },
      });
      setTimeout(() => sb.removeChannel(ch), 1500);
    } catch { /* best-effort */ }
  };

  const handleTransferToMember = (userId: string, memberName: string) => {
    assignMutation.mutate({ conversationId, userId });
    if (!isAiPaused) {
      aiPauseMutation.mutate({
        conversationId,
        paused: true,
        currentMetadata: conversationMetadata,
      });
    }
    notifyReceiver(userId, memberName);
    playSound('transferencia');
  };

  const handleReturnToJulia = async () => {
    // Um único endpoint no servidor faz tudo: remove assignee, despausa e aciona Julia
    try {
      await fetch('/api/messaging/ai/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      });
    } catch (err) {
      console.error('[TransferButton] Falha ao acionar Julia:', err);
    }

    // Invalida cache local para refletir a mudança na UI
    assignMutation.mutate({ conversationId, userId: null });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors flex items-center gap-1.5"
          title="Transferir atendimento"
        >
          <ArrowLeftRight className="w-5 h-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {otherMembers.length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs text-slate-500 font-normal">
              Transferir para
            </DropdownMenuLabel>
            {otherMembers.map((member) => (
              <DropdownMenuItem
                key={member.id}
                onClick={() => handleTransferToMember(member.id, member.name)}
                className="gap-2 cursor-pointer"
                disabled={assignedUserId === member.id}
              >
                <div className="flex items-center gap-2 flex-1">
                  <UserCheck className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="flex-1 truncate">{member.name}</span>
                  <StatusDot status={(member.status ?? 'online') as AgentStatus} size="sm" />
                </div>
                {assignedUserId === member.id && (
                  <span className="ml-auto text-xs text-slate-400">atual</span>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          onClick={handleReturnToJulia}
          className="gap-2 cursor-pointer"
          disabled={!!assignedUserId && assignedUserId !== profile?.id}
        >
          <Bot className="w-4 h-4 text-violet-500" />
          <span>Devolver para Júlia</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
