import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createStaticAdminClient } from '@/lib/supabase/staticAdminClient';

/**
 * DELETE /api/messaging/messages/[messageId]
 * Soft-deleta uma mensagem outbound (marca deleted_at).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const { messageId } = await params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Busca a mensagem validando que pertence à organização do usuário
    const { data: message, error: msgError } = await supabase
      .from('messaging_messages')
      .select(`
        id,
        direction,
        sender_user_id,
        deleted_at,
        conversation:messaging_conversations!conversation_id (
          organization_id
        )
      `)
      .eq('id', messageId)
      .single();

    if (msgError || !message) {
      return NextResponse.json({ message: 'Message not found' }, { status: 404 });
    }

    // Só mensagens outbound podem ser apagadas
    if (message.direction !== 'outbound') {
      return NextResponse.json({ message: 'Apenas mensagens enviadas podem ser apagadas' }, { status: 400 });
    }

    // Já apagada
    if (message.deleted_at) {
      return NextResponse.json({ message: 'Mensagem já foi apagada' }, { status: 409 });
    }

    // Valida que a conversa pertence à organização do usuário
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    const conv = message.conversation as unknown as { organization_id: string } | null;
    if (!profile || conv?.organization_id !== profile.organization_id) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const { error: updateError } = await supabase
      .from('messaging_messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', messageId);

    if (updateError) {
      return NextResponse.json({ message: 'Failed to delete message' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[messaging/messages/delete]', err instanceof Error ? err.message : err);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/messaging/messages/[messageId]
 * Edita o texto de uma mensagem outbound.
 * Atualiza o conteúdo no CRM e tenta editar no WhatsApp (janela de 15 min).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const { messageId } = await params;
    const body = await req.json() as { text?: string };
    const newText = typeof body.text === 'string' ? body.text.trim() : '';

    if (!newText) {
      return NextResponse.json({ message: 'Texto não pode ser vazio' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { data: message, error: msgError } = await supabase
      .from('messaging_messages')
      .select(`
        id,
        direction,
        content_type,
        content,
        external_id,
        deleted_at,
        created_at,
        metadata,
        conversation:messaging_conversations!conversation_id (
          organization_id
        )
      `)
      .eq('id', messageId)
      .single();

    if (msgError || !message) {
      return NextResponse.json({ message: 'Message not found' }, { status: 404 });
    }
    if (message.direction !== 'outbound') {
      return NextResponse.json({ message: 'Apenas mensagens enviadas podem ser editadas' }, { status: 400 });
    }
    if (message.deleted_at) {
      return NextResponse.json({ message: 'Mensagem apagada não pode ser editada' }, { status: 409 });
    }
    if (message.content_type !== 'text') {
      return NextResponse.json({ message: 'Apenas mensagens de texto podem ser editadas' }, { status: 400 });
    }

    // Valida org
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    const conv = message.conversation as unknown as { organization_id: string } | null;
    if (!profile || conv?.organization_id !== profile.organization_id) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const editedAt = new Date().toISOString();
    const newContent = { ...(message.content as Record<string, unknown>), text: newText };
    const newMetadata = {
      ...(message.metadata as Record<string, unknown> ?? {}),
      edited_at: editedAt,
    };

    const supabaseAdmin = createStaticAdminClient();
    const { error: updateError } = await supabaseAdmin
      .from('messaging_messages')
      .update({ content: newContent, metadata: newMetadata })
      .eq('id', messageId);

    if (updateError) {
      return NextResponse.json({ message: 'Failed to update message' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, editedAt });
  } catch (err) {
    console.error('[messaging/messages/patch]', err instanceof Error ? err.message : err);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
