import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    const conv = message.conversation as { organization_id: string } | null;
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
