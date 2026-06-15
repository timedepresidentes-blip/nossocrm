'use client';

import React from 'react';
import { ArrowLeftRight, Bot, UserCheck } from 'lucide-react';
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

interface TransferButtonProps {
  conversationId: string;
  assignedUserId?: string | null;
  conversationMetadata: Record<string, unknown>;
  assignedAt?: string;
}

export function TransferButton({
  conversationId,
  assignedUserId,
  conversationMetadata,
  assignedAt,
}: TransferButtonProps) {
  const { profile } = useAuth();
  const { data: members = [] } = useOrgMembersQuery();
  const assignMutation = useAssignConversation();
  const aiPauseMutation = useToggleConversationAiPause();

  const isAiPaused =
    conversationMetadata?.ai_paused === true ||
    (conversationMetadata?.ai_paused !== false && !!assignedAt);

  // Outros membros (exclui o próprio usuário logado)
  const otherMembers = members.filter((m) => m.id !== profile?.id);

  const handleTransferToMember = (userId: string) => {
    // Atribui ao membro e pausa a Júlia
    assignMutation.mutate({ conversationId, userId });
    if (!isAiPaused) {
      aiPauseMutation.mutate({
        conversationId,
        paused: true,
        currentMetadata: conversationMetadata,
      });
    }
  };

  const handleReturnToJulia = () => {
    // Remove atribuição e reativa a Júlia
    assignMutation.mutate({ conversationId, userId: null });
    aiPauseMutation.mutate({
      conversationId,
      paused: false,
      currentMetadata: conversationMetadata,
    });
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
                onClick={() => handleTransferToMember(member.id)}
                className="gap-2 cursor-pointer"
                disabled={assignedUserId === member.id}
              >
                <UserCheck className="w-4 h-4 text-slate-400" />
                <span>{member.name}</span>
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
          disabled={!isAiPaused && !assignedUserId}
        >
          <Bot className="w-4 h-4 text-violet-500" />
          <span>Devolver para Júlia</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
