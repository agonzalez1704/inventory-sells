-- Who gets notified is a property of the role, not of the person.
--
-- notification_prefs is per user, and only an admin could edit their own — so
-- the seller who needs to hear about a warranty had no row, no switch, and no
-- notification. The audience was also resolved from profiles.role = 'admin', a
-- label that predates roles being data: Jefe de almacén approves warranties and
-- was never going to be told one arrived.
--
-- Presence means enabled. A join table rather than a column per kind: adding a
-- notification should not be an ALTER on a table the app writes to.
CREATE TABLE public.role_notification_prefs (
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  kind    text NOT NULL CHECK (kind IN ('venta','fiado','abono','cancelacion','garantia')),
  PRIMARY KEY (role_id, kind)
);

ALTER TABLE public.role_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read role_notification_prefs"
  ON public.role_notification_prefs FOR SELECT TO authenticated
  USING (public.requesting_user_id() IS NOT NULL);
-- Writing is managing the shop's staff, so it rides the permission that already
-- means exactly that.
CREATE POLICY "usuarios_gestionar write role_notification_prefs"
  ON public.role_notification_prefs FOR ALL TO authenticated
  USING (public.tiene_permiso('usuarios_gestionar'))
  WITH CHECK (public.tiene_permiso('usuarios_gestionar'));

GRANT SELECT, INSERT, DELETE ON public.role_notification_prefs TO authenticated;

-- Seed what the app did before, so nobody's notifications go quiet on deploy:
-- admins got venta and fiado on, abono and cancelacion off.
INSERT INTO public.role_notification_prefs (role_id, kind)
SELECT r.id, k.kind
  FROM public.roles r
  JOIN public.role_permissions rp ON rp.role_id = r.id AND rp.permiso = 'admin_total'
  CROSS JOIN (VALUES ('venta'), ('fiado')) AS k(kind)
ON CONFLICT DO NOTHING;

-- And the one this was built for: everybody who can approve a warranty hears
-- about one arriving. A claim nobody is told about is a customer waiting.
INSERT INTO public.role_notification_prefs (role_id, kind)
SELECT r.id, 'garantia'
  FROM public.roles r
  JOIN public.role_permissions rp ON rp.role_id = r.id
 WHERE rp.permiso IN ('garantias_aprobar', 'admin_total')
ON CONFLICT DO NOTHING;

-- Who to push to, for one kind. Replaces the role='admin' lookup plus the
-- per-user preference filter with one question asked of the role.
CREATE OR REPLACE FUNCTION public.usuarios_a_notificar(p_kind text)
RETURNS TABLE (user_id text)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT DISTINCT pr.id
    FROM public.profiles pr
    JOIN public.role_notification_prefs rn ON rn.role_id = pr.role_id
   WHERE rn.kind = p_kind;
$$;

GRANT EXECUTE ON FUNCTION public.usuarios_a_notificar(text) TO authenticated;

-- The whole matrix, for the settings screen.
CREATE OR REPLACE FUNCTION public.notificaciones_por_rol()
RETURNS TABLE (role_id uuid, rol text, kinds text[])
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT r.id, r.name,
         coalesce(array_agg(rn.kind ORDER BY rn.kind) FILTER (WHERE rn.kind IS NOT NULL), '{}')
    FROM public.roles r
    LEFT JOIN public.role_notification_prefs rn ON rn.role_id = r.id
   GROUP BY r.id, r.name
   ORDER BY r.name;
$$;

GRANT EXECUTE ON FUNCTION public.notificaciones_por_rol() TO authenticated;
