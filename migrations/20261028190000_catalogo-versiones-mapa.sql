-- The catalog's known versions per car, "Marca|Modelo" → [versiones], so the
-- Versión field suggests "2ª generación" instead of a free-typed variant
-- that would split the car into two tags. One jsonb value (RPC row cap).
CREATE OR REPLACE FUNCTION public.catalogo_versiones_mapa()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT coalesce(jsonb_object_agg(k, vs), '{}'::jsonb) FROM (
    SELECT veh_marca || '|' || veh_modelo AS k, jsonb_agg(DISTINCT veh_version ORDER BY veh_version) AS vs
      FROM public.tags
     WHERE veh_marca IS NOT NULL AND veh_modelo IS NOT NULL AND veh_version IS NOT NULL AND veh_version <> ''
     GROUP BY 1
  ) x;
$$;

REVOKE ALL ON FUNCTION public.catalogo_versiones_mapa() FROM public;
GRANT EXECUTE ON FUNCTION public.catalogo_versiones_mapa() TO authenticated;
