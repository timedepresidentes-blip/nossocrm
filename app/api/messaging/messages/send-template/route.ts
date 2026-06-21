import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import {
  getChannelRouter,
  transformMessage,
  transformTemplate,
} from '@/lib/messaging';
import type {
  SendTemplateParams,
  TemplateComponentParam,
  DbMessagingMessage,
  DbMessagingTemplate,
} from '@/lib/messaging';

/**
 * Request body for sending a template message.
 */
interface SendTemplateRequestBody {
  conversationId: string;
  templateId: string;
  /** Optional parameters for template variables */
  parameters?: {
    header?: TemplateParameterInput[];
    body?: TemplateParameterInput[];
    buttons?: { index: number; parameters: TemplateParameterInput[] }[];
  };
}

interface TemplateParameterInput {
  type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video';
  text?: string;
  currency?: { code: string; amount: number };
  dateTime?: { fallbackValue: string };
  image?: { link: string };
  document?: { link: string; filename?: string };
  video?: { link: string };
}

/**
 * POST /api/messaging/messages/send-template
 * Sends a WhatsApp template message
 *
 * Body: SendTemplateRequestBody
 * Returns: MessagingMessage (the created message)
 */
export async function POST(request: NextRequest) {
  // CORS check
  if (!isAllowedOrigin(request)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = await createClient();

    // Verify auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ message: 'Profile not found' }, { status: 404 });
    }

    // Parse request body
    const body: SendTemplateRequestBody = await request.json();
    const { conversationId, templateId, parameters } = body;

    if (!conversationId || !templateId) {
      return NextResponse.json(
        { message: 'conversationId and templateId are required' },
        { status: 400 }
      );
    }

    // Fetch conversation with channel info
    const { data: conversation, error: convError } = await supabase
      .from('messaging_conversations')
      .select(
        `
        *,
        channel:messaging_channels!channel_id (
          id,
          channel_type,
          provider,
          organization_id
        )
      `
      )
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      return NextResponse.json({ message: 'Conversation not found' }, { status: 404 });
    }

    // Verify conversation belongs to user's org
    const channel = conversation.channel as {
      id: string;
      channel_type: string;
      provider: string;
      organization_id: string;
    };

    if (channel.organization_id !== profile.organization_id) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    // Fetch the template
    const { data: template, error: templateError } = await supabase
      .from('messaging_templates')
      .select('*')
      .eq('id', templateId)
      .eq('channel_id', channel.id)
      .single();

    if (templateError || !template) {
      return NextResponse.json({ message: 'Template not found' }, { status: 404 });
    }

    const dbTemplate = template as DbMessagingTemplate;

    // Verify template is approved
    if (dbTemplate.status !== 'approved') {
      return NextResponse.json(
        { message: `Template is not approved. Current status: ${dbTemplate.status}` },
        { status: 400 }
      );
    }

    // Normaliza {{}} → {{1}}, {{2}}... e substitui com os parâmetros fornecidos
    const bodyComponent = (dbTemplate.components as { type: string; text?: string }[])
      ?.find((c) => c.type === 'BODY');
    let renderedText: string | undefined;
    if (bodyComponent?.text) {
      let counter = 0;
      renderedText = bodyComponent.text.replace(/\{\{\}\}/g, () => `{{${++counter}}}`);
      const bodyParams = parameters?.body ?? [];
      bodyParams.forEach((param, i) => {
        renderedText = renderedText!.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), param.text ?? '');
      });
    }

    // Build content object for the message record
    const messageContent = {
      type: 'template' as const,
      templateName: dbTemplate.name,
      templateLanguage: dbTemplate.language,
      templateCategory: dbTemplate.category,
      parameters: parameters || {},
      ...(renderedText && { renderedText }),
    };

    // Busca nome do atendente para exibir na mensagem
    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('nickname, first_name, last_name')
      .eq('id', user.id)
      .maybeSingle();
    const senderName = senderProfile?.nickname
      || (senderProfile?.first_name ? `${senderProfile.first_name}${senderProfile.last_name ? ' ' + senderProfile.last_name : ''}` : null)
      || user.email?.split('@')[0]
      || null;

    // Create message record in database (pending state)
    const messageData = {
      conversation_id: conversationId,
      direction: 'outbound' as const,
      content_type: 'template' as const,
      content: messageContent as unknown as Record<string, unknown>,
      status: 'pending' as const,
      sender_user_id: user.id,
      sender_type: 'user' as const,
      sender_name: senderName,
      metadata: {
        templateId: dbTemplate.id,
        templateExternalId: dbTemplate.external_id,
      },
    };

    const { data: dbMessage, error: insertError } = await supabase
      .from('messaging_messages')
      .insert(messageData)
      .select()
      .single();

    if (insertError || !dbMessage) {
      console.error('[send-template] Failed to create message:', insertError);
      return NextResponse.json({ message: 'Failed to create message' }, { status: 500 });
    }

    // Update to queued status
    await supabase.from('messaging_messages').update({ status: 'queued' }).eq('id', dbMessage.id);

    // Build provider params
    const components: TemplateComponentParam[] = [];

    if (parameters?.header && parameters.header.length > 0) {
      components.push({
        type: 'header',
        parameters: parameters.header,
      });
    }

    // Conta variáveis numeradas {{N}} no corpo — {{}} vazio não conta como variável Meta
    const bodyText = bodyComponent?.text ?? '';
    const numberedVarCount = (bodyText.match(/\{\{\d+\}\}/g) ?? []).length;

    if (parameters?.body && parameters.body.length > 0 && numberedVarCount > 0) {
      // Envia apenas o número de parâmetros que o template realmente espera
      components.push({
        type: 'body',
        parameters: parameters.body.slice(0, numberedVarCount),
      });
    }

    if (parameters?.buttons) {
      for (const btn of parameters.buttons) {
        components.push({
          type: 'button',
          parameters: btn.parameters,
        });
      }
    }

    const sendParams: SendTemplateParams = {
      conversationId,
      to: conversation.external_contact_id,
      templateName: dbTemplate.name,
      templateLanguage: dbTemplate.language,
      components: components.length > 0 ? components : undefined,
    };

    // Send via channel router
    const router = getChannelRouter();
    const result = await router.sendTemplate(channel.id, sendParams);

    // Update message status based on result
    if (result.success) {
      await supabase
        .from('messaging_messages')
        .update({
          status: 'sent',
          external_id: result.externalMessageId,
          sent_at: new Date().toISOString(),
        })
        .eq('id', dbMessage.id);
    } else {
      await supabase
        .from('messaging_messages')
        .update({
          status: 'failed',
          error_code: result.error?.code,
          error_message: result.error?.message,
          failed_at: new Date().toISOString(),
        })
        .eq('id', dbMessage.id);
    }

    // Fetch updated message and return
    const { data: updatedMessage } = await supabase
      .from('messaging_messages')
      .select('*')
      .eq('id', dbMessage.id)
      .single();

    if (!updatedMessage) {
      return NextResponse.json(
        transformMessage({
          ...dbMessage,
          status: result.success ? 'sent' : 'failed',
        } as DbMessagingMessage)
      );
    }

    return NextResponse.json(transformMessage(updatedMessage as DbMessagingMessage));
  } catch (error) {
    console.error(
      '[messaging/messages/send-template]',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
