-- Tabela de respostas rápidas para o chat
-- Permite atalhos como /saudacao que inserem texto predefinido na caixa de mensagem

CREATE TABLE IF NOT EXISTS public.quick_replies (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID      NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shortcut      TEXT        NOT NULL,
  title         TEXT        NOT NULL,
  content       TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, shortcut)
);

-- Índice para busca por shortcut dentro da organização
CREATE INDEX IF NOT EXISTS quick_replies_org_shortcut
  ON public.quick_replies (organization_id, shortcut);

-- RLS
ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quick_replies_org_isolate" ON public.quick_replies
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());
