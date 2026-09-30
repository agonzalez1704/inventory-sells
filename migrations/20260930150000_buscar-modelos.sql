-- Skip the make: the counter says "un Versa", not "un Nissan Versa".
--
-- Model names are nearly unique on their own — 1,549 distinct names across
-- 1,579 make+model pairs — so asking for the make first is a step that buys
-- almost nothing and costs a tap on every sale. This searches models directly
-- and carries the make along as context.

CREATE OR REPLACE FUNCTION public.vehiculo_buscar_modelos(
  p_q     text DEFAULT NULL,
  p_limit int  DEFAULT 40
)
RETURNS TABLE (
  marca      text,
  modelo     text,
  piezas     int,
  anio_min   int,
  anio_max   int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT t.veh_marca,
         t.veh_modelo,
         count(DISTINCT pt.product_id)::int,
         min(t.veh_anio_desde)::int,
         max(coalesce(t.veh_anio_hasta, t.veh_anio_desde))::int
    FROM public.tags t
    JOIN public.product_tags pt ON pt.tag_id = t.id
    JOIN public.products p ON p.id = pt.product_id AND p.is_active
   WHERE t.veh_marca IS NOT NULL
     AND t.veh_modelo IS NOT NULL
     AND (
       p_q IS NULL OR btrim(p_q) = ''
       OR public.normalizar_pieza(t.veh_modelo) LIKE '%' || public.normalizar_pieza(p_q) || '%'
       OR public.normalizar_pieza(t.veh_marca)  LIKE '%' || public.normalizar_pieza(p_q) || '%'
     )
   GROUP BY t.veh_marca, t.veh_modelo
   -- The models the shop stocks most come first: that is what walks in.
   ORDER BY count(DISTINCT pt.product_id) DESC, t.veh_modelo
   LIMIT greatest(1, least(p_limit, 200));
$$;

REVOKE ALL ON FUNCTION public.vehiculo_buscar_modelos(text, int) FROM public;
GRANT EXECUTE ON FUNCTION public.vehiculo_buscar_modelos(text, int) TO authenticated;
