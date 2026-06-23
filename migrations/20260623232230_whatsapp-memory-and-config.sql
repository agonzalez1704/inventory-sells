-- WhatsApp conversation memory + editable business info for the agent.

CREATE TABLE public.wa_mensajes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero     TEXT NOT NULL,
  rol        TEXT NOT NULL CHECK (rol IN ('user', 'assistant')),
  contenido  TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wa_mensajes_numero_created ON public.wa_mensajes(numero, created_at);

ALTER TABLE public.wa_mensajes ENABLE ROW LEVEL SECURITY;

-- Staff may read conversation history; writes happen via the admin client (webhook).
CREATE POLICY "authenticated read wa_mensajes"
  ON public.wa_mensajes FOR SELECT TO authenticated
  USING (public.requesting_user_id() IS NOT NULL);

REVOKE INSERT, UPDATE, DELETE ON public.wa_mensajes FROM anon, authenticated;
GRANT  SELECT ON public.wa_mensajes TO authenticated;

-- Single-row business config injected into the agent's system prompt.
CREATE TABLE public.config_negocio (
  id         INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  info       TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.config_negocio (id, info) VALUES (1, '') ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER config_negocio_touch_updated_at
  BEFORE UPDATE ON public.config_negocio
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.config_negocio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read config_negocio"
  ON public.config_negocio FOR SELECT TO authenticated
  USING (public.requesting_user_id() IS NOT NULL);

CREATE POLICY "admin update config_negocio"
  ON public.config_negocio FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

REVOKE INSERT, UPDATE, DELETE ON public.config_negocio FROM anon, authenticated;
GRANT  SELECT ON public.config_negocio TO authenticated;
GRANT  UPDATE (info) ON public.config_negocio TO authenticated;
