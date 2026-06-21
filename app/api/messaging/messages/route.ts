import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createStaticAdminClient } from '@/lib/supabase/staticAdminClient';
// Import from main module to ensure providers are registered
import { getChannelRouter, transformMessage } from '@/lib/messaging';
import type { SendMessageInput, MessageContent, DbMessagingMessage } from '@/lib/messaging';
import {
  getConversationCache,
  setConversationCache,
} from '@/lib/messaging/conversation-cache';

// 60s para acomodar upload de áudio para Meta + envio da mensagem
export const maxDuration = 60;

type ChannelInfo = { id: string; channel_type: string; provider: string };

export async function POST(request: NextRequest) {
  try {
    const [supabase, body] = await Promise.all([
      createClient(),
      request.json() as Promise<SendMessageInput>,
    ]);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { conversationId, content, replyToMessageId } = body;

    if (!conversationId || !content) {
      return NextResponse.json(
        { message: 'conversationId and content are required' },
        { status: 400 }
      );
    }

    const orgId: string | undefined =
      (user.app_metadata?.organization_id as string | undefined) ??
      await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single()
        .then(({ data }) => data?.organization_id as string | undefined);

    if (!orgId) {
      return NextResponse.json({ message: 'Profile not found' }, { status: 404 });
    }

    let channel: ChannelInfo;
    let externalContactId: string;

    const cached = getConversationCache(conversationId, orgId);

    if (cached) {
      channel = cached.channel;
      externalContactId = cached.external_contact_id;
    } else {
      const { data: conversation, error: convError } = await supabase
        .from('messaging_conversations')
        .select(`
          id,
          organization_id,
          external_contact_id,
          channel:messaging_channels!channel_id (
            id,
            channel_type,
            provider
          )
        `)
        .eq('id', conversationId)
        .eq('organization_id', orgId)
        .single();

      if (convError || !conversation) {
        return NextResponse.json(
          { message: 'Conversation not found' },
          { status: 404 }
        );
      }

      channel = conversation.channel as unknown as ChannelInfo;
      externalContactId = conversation.external_contact_id;

      setConversationCache({
        id: conversation.id,
        organization_id: conversation.organization_id,
        external_contact_id: externalContactId,
        channel,
      });
    }

    // Busca nome do atendente para exibir nas mensagens
    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('nickname, first_name, last_name')
      .eq('id', user.id)
      .maybeSingle();
    const senderName = senderProfile?.nickname
      || (senderProfile?.first_name ? `${senderProfile.first_name}${senderProfile.last_name ? ' ' + senderProfile.last_name : ''}` : null)
      || user.email?.split('@')[0]
      || null;

    // Cria a mensagem no banco (status pending)
    const messageData = {
      conversation_id: conversationId,
      direction: 'outbound' as const,
      content_type: content.type,
      content: content as unknown as Record<string, unknown>,
      reply_to_message_id: replyToMessageId || null,
      status: 'pending' as const,
      sender_user_id: user.id,
      sender_type: 'user' as const,
      sender_name: senderName,
      metadata: {},
    };

    const { data: dbMessage, error: insertError } = await supabase
      .from('messaging_messages')
      .insert(messageData)
      .select()
      .single();

    if (insertError || !dbMessage) {
      return NextResponse.json(
        { message: 'Failed to create message' },
        { status: 500 }
      );
    }

    const supabaseAdmin = createStaticAdminClient();
    const messageId = dbMessage.id;
    const channelId = channel.id;
    const router = getChannelRouter();

    // Atualiza para queued antes de enviar
    await supabaseAdmin
      .from('messaging_messages')
      .update({ status: 'queued' })
      .eq('id', messageId);

    // Resolve replyToExternalId se necessário
    let replyToExternalId: string | undefined;
    if (replyToMessageId) {
      const { data: replyMsg } = await supabaseAdmin
        .from('messaging_messages')
        .select('external_id, metadata')
        .eq('id', replyToMessageId)
        .maybeSingle();

      if (replyMsg) {
        const zapiId = (replyMsg.metadata as Record<string, unknown> | null)?.zapi_message_id as string | undefined;
        replyToExternalId = (channel.provider === 'z-api' ? zapiId : undefined) ?? replyMsg.external_id ?? undefined;
      }
    }

    console.log('[messaging/messages] sending to provider:', {
      messageId, channelId, provider: channel.provider,
      contentType: (content as MessageContent).type, to: externalContactId,
    });

    // Envia via provider de forma SÍNCRONA — garante execução completa no Vercel
    let finalMessage: DbMessagingMessage;
    try {
      const result = await router.sendMessage(channelId, {
        conversationId,
        to: externalContactId,
        content: content as MessageContent,
        replyToExternalId,
      });

      console.log('[messaging/messages] provider result:', JSON.stringify(result));

      if (result.success) {
        await supabaseAdmin
          .from('messaging_messages')
          .update({
            status: 'sent',
            external_id: result.externalMessageId,
            sent_at: new Date().toISOString(),
          })
          .eq('id', messageId);
      } else {
        console.error('[messaging/messages] provider failure:', result.error);
        await supabaseAdmin
          .from('messaging_messages')
          .update({
            status: 'failed',
            error_code: result.error?.code,
            error_message: result.error?.message,
            failed_at: new Date().toISOString(),
          })
          .eq('id', messageId);
      }
    } catch (sendErr: unknown) {
      const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
      console.error('[messaging/messages] send exception:', errMsg);
      await supabaseAdmin
        .from('messaging_messages')
        .update({
          status: 'failed',
          error_code: 'SEND_EXCEPTION',
          error_message: errMsg.slice(0, 500),
          failed_at: new Date().toISOString(),
        })
        .eq('id', messageId);
    }

    // Busca a mensagem atualizada para retornar o status final ao cliente
    const { data: updatedMessage } = await supabaseAdmin
      .from('messaging_messages')
      .select('*')
      .eq('id', messageId)
      .single();

    return NextResponse.json(
      transformMessage((updatedMessage ?? dbMessage) as DbMessagingMessage)
    );
  } catch (error) {
    console.error('[messaging/messages]', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
