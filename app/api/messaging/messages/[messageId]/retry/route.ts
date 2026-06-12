/**
 * POST /api/messaging/messages/[messageId]/retry
 *
 * Retry sending a failed message via its original channel/provider.
 * Para áudio: re-upload direto para Meta Media API, sem conversão de formato.
 * Meta aceita audio/mp4, audio/ogg, audio/mpeg nativamente.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createStaticAdminClient } from '@/lib/supabase/staticAdminClient';
import { getChannelRouter, transformMessage } from '@/lib/messaging';
import type { MessageContent, DbMessagingMessage, AudioContent } from '@/lib/messaging';

export const runtime = 'nodejs';
export const maxDuration = 120;

const META_GRAPH_URL = 'https://graph.facebook.com/v25.0';

// Baixa áudio de uma URL e faz upload direto para Meta (sem conversão de formato)
async function reuploadAudioToMeta(
  mediaUrl: string,
  phoneNumberId: string,
  accessToken: string,
): Promise<string | null> {
  try {
    const fileRes = await fetch(mediaUrl);
    if (!fileRes.ok) {
      console.error('[retry] Download falhou:', fileRes.status, mediaUrl);
      return null;
    }

    const fileBuffer = Buffer.from(await fileRes.arrayBuffer());
    const rawMime = (fileRes.headers.get('content-type') ?? '').split(';')[0].trim() || 'audio/mp4';
    // audio/webm não é suportado pela Meta — envia como audio/ogg (mesmo codec Opus)
    const mimeType = rawMime === 'audio/webm' ? 'audio/ogg' : rawMime;

    const extMap: Record<string, string> = {
      'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac',
      'audio/ogg': 'ogg', 'audio/amr': 'amr', 'audio/webm': 'webm',
    };
    const filename = `audio.${extMap[mimeType] ?? 'mp3'}`;

    const metaForm = new FormData();
    metaForm.append('messaging_product', 'whatsapp');
    metaForm.append('type', mimeType);
    metaForm.append('file', new Blob([new Uint8Array(fileBuffer)], { type: mimeType }), filename);

    const metaRes = await fetch(`${META_GRAPH_URL}/${phoneNumberId}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: metaForm,
    });

    const data = await metaRes.json() as { id?: string; error?: { message: string; code: number } };
    if (data.id) {
      console.log('[retry] Áudio re-uploaded para Meta como', mimeType, '— mediaId:', data.id);
      return data.id;
    }
    console.error('[retry] Meta rejeitou upload:', JSON.stringify(data.error));
    return null;
  } catch (err) {
    console.error('[retry] Falha no reupload:', err instanceof Error ? err.message : err);
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

    // Para mensagens de áudio: se a URL não é meta:ID, faz re-upload para Meta antes de retentar
    if (content.type === 'audio') {
      const audioContent = content as AudioContent;
      const msgContentRaw = message.content as Record<string, unknown>;
      const mediaUrl = audioContent.mediaUrl ?? '';

      if (mediaUrl && !mediaUrl.startsWith('meta:')) {
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
            content = { ...audioContent, mediaUrl: newMediaUrl } as AudioContent;
            await supabase
              .from('messaging_messages')
              .update({ content: { ...msgContentRaw, mediaUrl: newMediaUrl, originalUrl: mediaUrl } })
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
