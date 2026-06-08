import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createStaticAdminClient } from '@/lib/supabase/staticAdminClient';

function json<T>(body: T, status = 200) {
  return NextResponse.json(body, { status });
}

/**
 * DELETE /api/messaging/conversations/[conversationId]
 * Apaga uma conversa e todas as suas mensagens de forma segura (server-side).
 * Usa o admin client para contornar RLS e garantir que a deleção seja completa.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return json({ message: 'Unauthorized' }, 401);
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return json({ message: 'Profile not found' }, 404);
    }

    // Valida que a conversa pertence à organização do usuário
    const { data: conversation } = await supabase
      .from('messaging_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('organization_id', profile.organization_id)
      .single();

    if (!conversation) {
      return json({ message: 'Conversation not found' }, 404);
    }

    // Usa admin client para deletar sem restrições de RLS
    const admin = createStaticAdminClient();

    const { error: msgError } = await admin
      .from('messaging_messages')
      .delete()
      .eq('conversation_id', conversationId);

    if (msgError) {
      console.error('[delete-conversation] Falha ao deletar mensagens:', msgError.message);
      return json({ message: 'Failed to delete messages' }, 500);
    }

    const { error: convError } = await admin
      .from('messaging_conversations')
      .delete()
      .eq('id', conversationId);

    if (convError) {
      console.error('[delete-conversation] Falha ao deletar conversa:', convError.message);
      return json({ message: 'Failed to delete conversation' }, 500);
    }

    return json({ ok: true });
  } catch (err) {
    console.error('[delete-conversation]', err instanceof Error ? err.message : err);
    return json({ message: 'Internal server error' }, 500);
  }
}
