/**
 * POST /api/messaging/messages/[messageId]/retry
 *
 * Retry sending a failed message via its original channel/provider.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createStaticAdminClient } from '@/lib/supabase/staticAdminClient';
import { getChannelRouter, transformMessage } from '@/lib/messaging';
import type { MessageContent, DbMessagingMessage, AudioContent } from '@/lib/messaging';

export const maxDuration = 120;

const META_GRAPH_URL = 'https://graph.facebook.com/v25.0';

// Para áudio com URL do Supabase: faz upload direto para Meta e retorna mediaId
async function reuploadAudioToMeta(
  mediaUrl: string,
  phoneNumberId: string,
  accessToken: string,
): Promise<string | null> {
  try {
    const fileRes = await fetch(mediaUrl);
    if (!fileRes.ok) {
      console.error('[retry] Download do Supabase falhou:', fileRes.status, mediaUrl);
      return null;
    }
    const fileBlob = await fileRes.blob();
    const mimeType = fileBlob.type || 'audio/mpeg';
    const extMap: Record<string, string> = {
      'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac',
      'audio/ogg': 'ogg', 'audio/amr': 'amr', 'audio/webm': 'webm',
    };
    const filename = `audio.${extMap[mimeType] || 'mp3'}`;

    const metaForm = new FormData();
    metaForm.append('messaging_product', 'whatsapp');
    metaForm.append('type', mimeType);
    metaForm.append('file', fileBlob, filename);

    const metaRes = await fetch(`${META_GRAPH_URL}/${phoneNumberId}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: metaForm,
    });

    const data = await metaRes.json() as { id?: string; error?: { message: string; code: number } };
    if (data.id) {
      console.log('[retry] Áudio reenviado para Meta, mediaId:', data.id);
      return data.id;
    }
    console.error('[retry] Meta rejeitou upload de áudio:', JSON.stringify(data.error));
    return null;
  } catch (err) {
    console.error('[retry] Falha no upload de áudio para Meta:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const { messageId } = await params;
    const supabase = await createClient();

    // Auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Fetch the failed message with conversation + channel info
    const { data: message, error: msgError } = await supabase
      .from('messaging_messages')
      .select(
        `
        *,
        conversation:messaging_conversations!conversation_id (
          id,
          external_contact_id,
          channel_id,
          channel:messaging_channels!channel_id (
            id,
            channel_type,
            provider,
            organization_id
          )
        )
      `
      )
      .eq('id', messageId)
      .single();

    if (msgError || !message) {
      return NextResponse.json(
        { message: 'Message not found' },
        { status: 404 }
      );
    }

    // Permite retry de mensagens failed OU stuck em pending/queued há mais de 3 minutos
    const isStuck = (message.status === 'pending' || message.status === 'queued')
      && new Date(message.created_at).getTime() < Date.now() - 3 * 60 * 1000;

    if (message.status !== 'failed' && !isStuck) {
      return NextResponse.json(
        { message: 'Only failed or stuck messages can be retried' },
        { status: 400 }
      );
    }

    const conversation = message.conversation as {
      id: string;
      external_contact_id: string;
      channel_id: string;
      channel: {
        id: string;
        channel_type: string;
        provider: string;
        organization_id: string;
      };
    };

    if (!conversation?.channel) {
      return NextResponse.json(
        { message: 'Message conversation or channel not found' },
        { status: 404 }
      );
    }

    // Validate org ownership
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile || profile.organization_id !== conversation.channel.organization_id) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    // Reset para queued — aceita failed ou pending/queued travadas
    const { data: resetResult } = await supabase
      .from('messaging_messages')
      .update({
        status: 'queued',
        error_code: null,
        error_message: null,
        failed_at: null,
      })
      .eq('id', messageId)
      .in('status', ['failed', 'pending', 'queued'])
      .select('id')
      .single();

    if (!resetResult) {
      return NextResponse.json(
        { message: 'Message is no longer in retryable state' },
        { status: 409 }
      );
    }

    // Retry via channel router
    const router = getChannelRouter();
    let content = message.content as unknown as MessageContent;

    // Para áudio com URL Supabase: faz upload direto para Meta antes de enviar
    if (content.type === 'audio') {
      const audioContent = content as AudioContent;
      const mediaUrl = audioContent.mediaUrl ?? '';
      if (mediaUrl && !mediaUrl.startsWith('meta:')) {
        // Usa admin-client: cookie-client (RLS) bloqueia leitura da coluna 'credentials'
        const supabaseAdmin = createStaticAdminClient();
        const { data: channelCreds } = await supabaseAdmin
          .from('messaging_channels')
          .select('credentials, provider')
          .eq('id', conversation.channel_id)
          .single();
        const creds = channelCreds?.credentials as Record<string, string> | null;
        const retryAccessToken = creds?.accessToken || creds?.access_token;
        const retryPhoneId = creds?.phoneNumberId || creds?.phone_number_id;
        if (channelCreds?.provider === 'meta-cloud' && retryAccessToken && retryPhoneId) {
          const mediaId = await reuploadAudioToMeta(mediaUrl, retryPhoneId, retryAccessToken);
          if (mediaId) {
            const newMediaUrl = `meta:${mediaId}`;
            content = { ...audioContent, mediaUrl: newMediaUrl };
            // Persiste o mediaId para que próximos retries não precisem fazer upload novamente
            await supabase
              .from('messaging_messages')
              .update({ content: { ...(message.content as Record<string, unknown>), mediaUrl: newMediaUrl } })
              .eq('id', messageId);
          }
        }
      }
    }

    const result = await router.sendMessage(conversation.channel_id, {
      conversationId: conversation.id,
      to: conversation.external_contact_id,
      content,
      replyToMessageId: message.reply_to_message_id || undefined,
    });

    // Update status based on result
    if (result.success) {
      await supabase
        .from('messaging_messages')
        .update({
          status: 'sent',
          external_id: result.externalMessageId,
          sent_at: new Date().toISOString(),
        })
        .eq('id', messageId);
    } else {
      await supabase
        .from('messaging_messages')
        .update({
          status: 'failed',
          error_code: result.error?.code,
          error_message: result.error?.message,
          failed_at: new Date().toISOString(),
        })
        .eq('id', messageId);
    }

    // Return updated message
    const { data: updatedMessage } = await supabase
      .from('messaging_messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (!updatedMessage) {
      return NextResponse.json(
        { message: 'Failed to fetch updated message' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      transformMessage(updatedMessage as DbMessagingMessage)
    );
  } catch (error) {
    console.error(
      '[messaging/messages/retry]',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
