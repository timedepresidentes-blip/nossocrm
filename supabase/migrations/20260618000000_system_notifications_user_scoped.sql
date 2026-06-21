-- Adiciona user_id à system_notifications para notificações direcionadas a um atendente específico
-- Sem user_id = notificação para toda a organização (comportamento anterior)
-- Com user_id = notificação apenas para aquele usuário (ex: "conversa transferida para você")

ALTER TABLE public.system_notifications
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_system_notifications_user_id
  ON public.system_notifications(user_id);

-- Atualiza RLS: usuário vê notificações da org que são para ele OU para a org toda (user_id IS NULL)
DROP POLICY IF EXISTS "system_notifications_org_isolate" ON public.system_notifications;
CREATE POLICY "system_notifications_user_scoped" ON public.system_notifications
  FOR ALL TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND (user_id IS NULL OR user_id = auth.uid())
  );
