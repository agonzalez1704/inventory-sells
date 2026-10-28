-- The catalog's make → models list as ONE jsonb value. catalogo_vehiculos()
-- returns 1,646 rows in Ruli and the API silently cuts RPC results at 1,000:
-- every make after ~"L" (Nissan, Toyota, VW…) was missing, so "Versa" read
-- as unknown. The old function stays for the deploy in flight.
CREATE OR REPLACE FUNCTION public.catalogo_vehiculos_mapa()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT coalesce(jsonb_object_agg(marca, modelos), '{}'::jsonb) FROM (
    SELECT veh_marca AS marca, jsonb_agg(DISTINCT veh_modelo ORDER BY veh_modelo) AS modelos
      FROM public.tags
     WHERE veh_marca IS NOT NULL AND veh_modelo IS NOT NULL
     GROUP BY veh_marca
  ) x;
$$;

REVOKE ALL ON FUNCTION public.catalogo_vehiculos_mapa() FROM public;
GRANT EXECUTE ON FUNCTION public.catalogo_vehiculos_mapa() TO authenticated;
