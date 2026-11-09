-- These four tables had RLS off while anon and authenticated held table grants,
-- so the public anon key could read and write them through the REST API, bank
-- accounts included. The app reaches them with the admin client, which bypasses
-- RLS. The one exception is Caja: its gastos query embeds the account's bank and
-- alias with the user's token, so authenticated keeps exactly those columns and
-- never the CLABE.
ALTER TABLE public.cuentas_negocio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboards_versiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitor_backend ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cuentas_negocio, public.dashboards, public.dashboards_versiones, public.monitor_backend
  FROM PUBLIC, anon, authenticated;

GRANT SELECT (id, banco, alias) ON public.cuentas_negocio TO authenticated;

DROP POLICY IF EXISTS "authenticated read cuentas_negocio" ON public.cuentas_negocio;
CREATE POLICY "authenticated read cuentas_negocio" ON public.cuentas_negocio
  FOR SELECT TO authenticated USING (public.requesting_user_id() IS NOT NULL);
