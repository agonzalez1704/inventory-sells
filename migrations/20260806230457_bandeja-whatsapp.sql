-- The WhatsApp inbox: see every conversation, not only the escalated ones.
--
-- Two things were missing to make the thread readable and the takeover real.

-- ---------------------------------------------------------------------------
-- 1. Tell the agent's words apart from a human's
-- ---------------------------------------------------------------------------
-- rol was 'user' | 'assistant', so a reply typed by a seller would be recorded
-- as if the model had written it. That destroys the main reason to read old
-- conversations — working out what the agent actually said so the prompt can be
-- fixed. 'asesor' is its own voice.
--
-- It also matters at runtime: cargarHistorial feeds these rows back to the
-- model, and a human's words presented as the model's own teach it to imitate
-- a register it cannot sustain.
ALTER TABLE public.wa_mensajes DROP CONSTRAINT IF EXISTS wa_mensajes_rol_check;
ALTER TABLE public.wa_mensajes
  ADD CONSTRAINT wa_mensajes_rol_check
  CHECK (rol = ANY (ARRAY['user', 'assistant', 'asesor']));

-- ---------------------------------------------------------------------------
-- 2. One row per conversation, with everything the list needs
-- ---------------------------------------------------------------------------
-- The conversaciones table only gains a row when the agent escalates, so it can
-- never be the source for "every conversation". The messages are, and identity
-- comes from wa_identidades — a customer who adopted a @username has no phone
-- number to show.
CREATE OR REPLACE FUNCTION public.wa_bandeja(p_limite int DEFAULT 100)
RETURNS TABLE (
  clave           text,
  telefono        text,
  username        text,
  cliente_nombre  text,
  cliente_id      uuid,
  estado          text,
  motivo          text,
  ultimo_texto    text,
  ultimo_rol      text,
  ultimo_at       timestamptz,
  mensajes        bigint
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH agg AS (
    SELECT m.numero AS clave,
           count(*) AS mensajes,
           max(m.created_at) AS ultimo_at
    FROM public.wa_mensajes m
    GROUP BY m.numero
  ),
  ultimo AS (
    SELECT DISTINCT ON (m.numero) m.numero, m.contenido, m.rol
    FROM public.wa_mensajes m
    ORDER BY m.numero, m.created_at DESC
  )
  SELECT a.clave,
         i.telefono,
         i.username,
         c.nombre,
         c.id,
         coalesce(cv.estado, 'bot'),
         cv.motivo,
         u.contenido,
         u.rol,
         a.ultimo_at,
         a.mensajes
  FROM agg a
  JOIN ultimo u ON u.numero = a.clave
  LEFT JOIN public.wa_identidades i ON i.clave = a.clave
  LEFT JOIN public.conversaciones cv ON cv.numero = a.clave
  -- Match the registry the same way detectarCliente does: last 10 digits.
  LEFT JOIN LATERAL (
    SELECT cu.id, cu.nombre
    FROM public.customer_phones_all cp
    JOIN public.customers cu ON cu.id = cp.customer_id
    WHERE coalesce(i.telefono, a.clave) <> ''
      AND cp.telefono_norm LIKE '%' || right(regexp_replace(coalesce(i.telefono, a.clave), '\D', '', 'g'), 10)
      AND cu.is_active AND NOT cu.is_system
    LIMIT 1
  ) c ON true
  ORDER BY a.ultimo_at DESC
  LIMIT greatest(1, least(coalesce(p_limite, 100), 500));
$$;

GRANT EXECUTE ON FUNCTION public.wa_bandeja(int) TO authenticated;

-- Take a conversation over, or hand it back. Same table the agent's own
-- escalation writes, so the webhook's existing pause check needs no changes.
CREATE OR REPLACE FUNCTION public.wa_tomar(p_clave text, p_tomar boolean, p_motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  INSERT INTO public.conversaciones (numero, estado, motivo, handoff_at, updated_at)
  VALUES (p_clave,
          CASE WHEN p_tomar THEN 'asesor' ELSE 'bot' END,
          CASE WHEN p_tomar THEN coalesce(p_motivo, 'Tomada manualmente') ELSE NULL END,
          CASE WHEN p_tomar THEN now() ELSE NULL END,
          now())
  ON CONFLICT (numero) DO UPDATE
    SET estado     = EXCLUDED.estado,
        motivo     = EXCLUDED.motivo,
        handoff_at = EXCLUDED.handoff_at,
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_tomar(text, boolean, text) TO authenticated;
