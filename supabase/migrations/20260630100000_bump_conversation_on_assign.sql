-- Sobe a conversa ao topo da fila quando é atribuída/transferida
-- Garante que o destinatário veja a conversa imediatamente no topo

CREATE OR REPLACE FUNCTION public.bump_conversation_on_assign()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Atualiza last_message_at quando assigned_user_id muda para um novo usuário
  IF OLD.assigned_user_id IS DISTINCT FROM NEW.assigned_user_id
     AND NEW.assigned_user_id IS NOT NULL THEN
    NEW.last_message_at = NOW();
    NEW.updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_bump_conversation_on_assign ON public.messaging_conversations;

CREATE TRIGGER tr_bump_conversation_on_assign
  BEFORE UPDATE ON public.messaging_conversations
  FOR EACH ROW EXECUTE FUNCTION public.bump_conversation_on_assign();
