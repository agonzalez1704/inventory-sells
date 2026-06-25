-- Per-conversation bot/asesor state for WhatsApp handoff. When the agent can't
-- resolve a request it flags the conversation as 'asesor': the bot pauses there
-- until a human returns it to 'bot' from the in-app inbox.
CREATE TABLE public.conversaciones (
  numero       text PRIMARY KEY,
  estado       text NOT NULL DEFAULT 'bot' CHECK (estado IN ('bot', 'asesor')),
  motivo       text,
  ultimo_texto text,
  handoff_at   timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER conversaciones_touch_updated_at
  BEFORE UPDATE ON public.conversaciones
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.conversaciones ENABLE ROW LEVEL SECURITY;

-- App users (staff) can see every conversation and return one to the bot.
-- The webhook writes with the admin client, which bypasses RLS.
CREATE POLICY "authenticated read conversaciones"
  ON public.conversaciones FOR SELECT TO authenticated
  USING (public.requesting_user_id() IS NOT NULL);

CREATE POLICY "authenticated update conversaciones"
  ON public.conversaciones FOR UPDATE TO authenticated
  USING (public.requesting_user_id() IS NOT NULL)
  WITH CHECK (public.requesting_user_id() IS NOT NULL);

REVOKE INSERT, UPDATE, DELETE ON public.conversaciones FROM anon, authenticated;
GRANT  SELECT ON public.conversaciones TO authenticated;
-- Staff may only flip the bot/asesor switch, nothing else.
GRANT  UPDATE (estado) ON public.conversaciones TO authenticated;

-- WhatsApp numbers (comma/space separated) notified when a conversation needs a
-- human. Best-effort: WhatsApp only delivers freely inside the 24h window.
ALTER TABLE public.config_negocio ADD COLUMN asesores text NOT NULL DEFAULT '';
GRANT UPDATE (asesores) ON public.config_negocio TO authenticated;
