-- Notify the people who can actually act on it.
--
-- adminsForKind picks profiles with role = 'admin', a leftover from before
-- roles were data. Approving a warranty is a permission now, and the people who
-- hold it are not necessarily the ones carrying that legacy label — Jefe de
-- almacén holds it and is not 'admin'.
CREATE OR REPLACE FUNCTION public.usuarios_con_permiso(p_permiso text)
RETURNS TABLE (user_id text)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT DISTINCT pr.id
    FROM public.profiles pr
    JOIN public.role_permissions rp ON rp.role_id = pr.role_id
   WHERE rp.permiso IN (p_permiso, 'admin_total');
$$;

GRANT EXECUTE ON FUNCTION public.usuarios_con_permiso(text) TO authenticated;

-- On by default: a warranty sitting unapproved is a customer waiting at the
-- counter, which is not something to opt into being told about.
ALTER TABLE public.notification_prefs
  ADD COLUMN garantia boolean NOT NULL DEFAULT true;

GRANT UPDATE (garantia) ON public.notification_prefs TO authenticated;
