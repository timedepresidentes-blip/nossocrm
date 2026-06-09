/**
 * POST /api/messaging/messages/[messageId]/retry
 *
 * Retry sending a failed message via its original channel/provider.
 * Para áudio audio/mp4: converte para audio/mpeg (MP3) antes de enviar ao Meta,
 * pois o WhatsApp Cloud API retorna erro 131053 com arquivos M4A.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createStaticAdminClient } from '@/lib/supabase/staticAdminClient';
import { getChannelRouter, transformMessage } from '@/lib/messaging';
import type { MessageContent, DbMessagingMessage, AudioContent } from '@/lib/messaging';
import { convertM4aToMp3 } from '@/lib/media/audio-converter';

export const runtime = 'nodejs';
export const maxDuration = 120;

const META_GRAPH_URL = 'https://graph.facebook.com/v25.0';

// Baixa áudio do Supabase, converte M4A→MP3 se necessário, e faz upload para Meta
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

    const rawBuffer = Buffer.from(await fileRes.arrayBuffer());
    const rawMime = (fileRes.headers.get('content-type') ?? '').split(';')[0].trim() || 'audio/mp4';

    let fileBuffer = rawBuffer;
    let mimeType = rawMime;

    // audio/mp4 (M4A) causa erro 131053 no WhatsApp — converte para MP3
    if (rawMime === 'audio/mp4' || rawMime === 'audio/m4a') {
      console.log('[retry] audio/mp4 detectado — convertendo para audio/mpeg...');
      const mp3Buffer = await convertM4aToMp3(rawBuffer);
      if (mp3Buffer && mp3Buffer.length > 0) {
        fileBuffer = mp3Buffer;
        mimeType = 'audio/mpeg';
        console.log('[retry] Conversão M4A→MP3 OK, tamanho:', mp3Buffer.length, 'bytes');
      } else {
        console.warn('[retry] Conversão falhou — tentando enviar com formato original');
      }
    }

    const extMap: Record<string, string> = {
      'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac',
      'audio/ogg': 'ogg', 'audio/amr': 'amr', 'audio/webm': 'webm',
    };
    const filename = `audio.${extMap[mimeType] || 'mp3'}`;

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
      console.log('[retry] Áudio enviado para Meta como', mimeType, '— mediaId:', data.id);
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

    // Para mensagens de áudio: garante que o Meta recebe MP3 (não M4A)
    if (content.type === 'audio') {
      const audioContent = content as AudioContent;
      const msgContentRaw = message.content as Record<string, unknown>;
      const mediaUrl = audioContent.mediaUrl ?? '';
      const contentMimeType = (msgContentRaw.mimeType as string) ?? '';

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
        if (mediaUrl && !mediaUrl.startsWith('meta:')) {
          // Caso 1: URL Supabase → re-upload com conversão M4A→MP3 se necessário
          const mediaId = await reuploadAudioToMeta(mediaUrl, retryPhoneId, retryAccessToken);
          if (mediaId) {
            const newMediaUrl = `meta:${mediaId}`;
            // Salva meta:ID + mimeType correto para não precisar converter novamente
            const updatedContent = {
              ...msgContentRaw,
              mediaUrl: newMediaUrl,
              mimeType: 'audio/mpeg',
              originalUrl: mediaUrl,
            };
            content = { ...audioContent, mediaUrl: newMediaUrl } as AudioContent;
            await supabase
              .from('messaging_messages')
              .update({ content: updatedContent })
              .eq('id', messageId);
          }
        } else if (mediaUrl.startsWith('meta:') && contentMimeType === 'audio/mp4') {
          // Caso 2: Já tem meta:ID mas era audio/mp4 — tenta re-upload com o arquivo original.
          // Verifica se a URL original foi preservada (salva no campo originalUrl).
          const originalUrl = (msgContentRaw.originalUrl as string) ?? '';

          let sourceUrl = originalUrl;

          // Se não tiver originalUrl, tenta encontrar o arquivo na pasta da conversa no Supabase Storage
          if (!sourceUrl) {
            const { data: storageFiles } = await supabaseAdmin.storage
              .from('messaging-media')
              .list(`${profile.organization_id}/${conversation.id}`);

            const targetSize = msgContentRaw.fileSize as number | undefined;
            const audioFile = storageFiles?.find(f => {
              const isAudio = f.name.endsWith('.m4a') || f.name.endsWith('.mp4') || f.name.endsWith('.aac');
              if (!isAudio) return false;
              if (targetSize && f.metadata?.size) {
                return Math.abs((f.metadata.size as number) - targetSize) < 1024;
              }
              return true;
            });

            if (audioFile) {
              sourceUrl = supabaseAdmin.storage
                .from('messaging-media')
                .getPublicUrl(`${profile.organization_id}/${conversation.id}/${audioFile.name}`)
                .data.publicUrl;
            }
          }

          if (sourceUrl) {
            const mediaId = await reuploadAudioToMeta(sourceUrl, retryPhoneId, retryAccessToken);
            if (mediaId) {
              const newMediaUrl = `meta:${mediaId}`;
              const updatedContent = {
                ...msgContentRaw,
                mediaUrl: newMediaUrl,
                mimeType: 'audio/mpeg',
              };
              content = { ...audioContent, mediaUrl: newMediaUrl } as AudioContent;
              await supabase
                .from('messaging_messages')
                .update({ content: updatedContent })
                .eq('id', messageId);
            }
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
