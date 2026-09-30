-- The version, between the model and the year.
--
-- "Hay Versa V-Drive y hay Versa segunda generación": the shop names the
-- generation, and the price list carries it as its own column. The tags only
-- had make, model and a year range, so the generation was implicit in the
-- range and nobody could ask for it by name.
--
-- The column starts empty on purpose: a range like "Versa 2007–2023" spans two
-- generations, so guessing a label from the years would put the wrong name on
-- real parts. Versions are named from Configuración, one model at a time, and
-- the search offers them only where they exist.

ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS veh_version text;

CREATE INDEX IF NOT EXISTS tags_version_idx
  ON public.tags (veh_marca, veh_modelo, veh_version)
  WHERE veh_version IS NOT NULL;

/**
 * The versions of one model, with the years each covers.
 *
 * A model nobody has named yet comes back as a single row with a null version:
 * the picker then goes straight to the years, exactly as before.
 */
CREATE OR REPLACE FUNCTION public.vehiculo_versiones(p_marca text, p_modelo text)
RETURNS TABLE (
  version   text,
  piezas    int,
  anio_min  int,
  anio_max  int,
  etiquetas int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT t.veh_version,
         count(DISTINCT pt.product_id)::int,
         min(t.veh_anio_desde)::int,
         max(coalesce(t.veh_anio_hasta, t.veh_anio_desde))::int,
         count(DISTINCT t.id)::int
    FROM public.tags t
    LEFT JOIN public.product_tags pt ON pt.tag_id = t.id
    LEFT JOIN public.products p ON p.id = pt.product_id AND p.is_active
   WHERE t.veh_marca = p_marca AND t.veh_modelo = p_modelo
   GROUP BY t.veh_version
   ORDER BY min(t.veh_anio_desde) NULLS LAST;
$$;

/**
 * Every year band of a model, named or not — what Configuración edits.
 *
 * One row per distinct range, because that is the unit a version is put on:
 * "2012–2019 → 2ª generación" names the band, not each of its tags.
 */
CREATE OR REPLACE FUNCTION public.vehiculo_rangos(p_marca text, p_modelo text)
RETURNS TABLE (
  anio_desde int,
  anio_hasta int,
  version    text,
  piezas     int,
  etiquetas  int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT t.veh_anio_desde,
         t.veh_anio_hasta,
         max(t.veh_version),
         count(DISTINCT pt.product_id)::int,
         count(DISTINCT t.id)::int
    FROM public.tags t
    LEFT JOIN public.product_tags pt ON pt.tag_id = t.id
    LEFT JOIN public.products p ON p.id = pt.product_id AND p.is_active
   WHERE t.veh_marca = p_marca AND t.veh_modelo = p_modelo
   GROUP BY t.veh_anio_desde, t.veh_anio_hasta
   ORDER BY t.veh_anio_desde NULLS LAST, t.veh_anio_hasta NULLS LAST;
$$;

/** Name one band of a model. Admin only: it renames what everyone searches. */
CREATE OR REPLACE FUNCTION public.nombrar_version(
  p_marca      text,
  p_modelo     text,
  p_anio_desde int,
  p_anio_hasta int,
  p_version    text
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  n int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'solo un administrador puede nombrar versiones' USING errcode = '42501';
  END IF;
  UPDATE public.tags
     SET veh_version = NULLIF(btrim(coalesce(p_version, '')), '')
   WHERE veh_marca = p_marca
     AND veh_modelo = p_modelo
     AND veh_anio_desde IS NOT DISTINCT FROM p_anio_desde
     AND veh_anio_hasta IS NOT DISTINCT FROM p_anio_hasta;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- The search gains the version, after the model and before the year.
DROP FUNCTION IF EXISTS public.piezas_por_vehiculo(text, text, int, text, boolean, int, text);

CREATE OR REPLACE FUNCTION public.piezas_por_vehiculo(
  p_marca      text,
  p_modelo     text DEFAULT NULL,
  p_anio       int  DEFAULT NULL,
  p_familia    text DEFAULT NULL,
  p_solo_stock boolean DEFAULT false,
  p_limit      int  DEFAULT 300,
  p_sistema    text DEFAULT NULL,
  p_version    text DEFAULT NULL
)
RETURNS TABLE (
  id             uuid,
  inventory_id   uuid,
  sku            text,
  name           text,
  image_url      text,
  price_cents    int,
  cost_cents     int,
  quantity       int,
  familia        text,
  familia_nombre text,
  sistema        text,
  sistema_nombre text,
  compat         text,
  anio_desde     int,
  anio_hasta     int,
  version        text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH coincide AS (
    SELECT DISTINCT ON (p.id)
      p.id, p.inventory_id, p.sku, p.name, p.image_url, p.price_cents, p.cost_cents,
      p.quantity, p.familia,
      t.veh_modelo, t.veh_anio_desde, t.veh_anio_hasta, t.veh_version
    FROM public.products p
    JOIN public.product_tags pt ON pt.product_id = p.id
    JOIN public.tags t ON t.id = pt.tag_id
    LEFT JOIN public.familias fx ON fx.id = p.familia
   WHERE p.is_active
     AND t.veh_marca = p_marca
     AND (p_modelo IS NULL OR t.veh_modelo = p_modelo)
     AND (p_version IS NULL OR t.veh_version = p_version)
     AND (
       p_anio IS NULL
       OR t.veh_anio_desde IS NULL
       OR p_anio BETWEEN t.veh_anio_desde AND coalesce(t.veh_anio_hasta, t.veh_anio_desde)
     )
     AND (p_familia IS NULL OR p.familia = p_familia)
     AND (p_sistema IS NULL OR fx.sistema = p_sistema)
     AND (NOT p_solo_stock OR p.quantity > 0)
   ORDER BY p.id, t.veh_anio_desde DESC NULLS LAST
  )
  SELECT c.id, c.inventory_id, c.sku, c.name, c.image_url, c.price_cents, c.cost_cents,
         c.quantity, c.familia, f.nombre, f.sistema, s.nombre,
         CASE
           WHEN c.veh_anio_desde IS NULL THEN c.veh_modelo
           WHEN c.veh_anio_hasta IS NULL OR c.veh_anio_hasta = c.veh_anio_desde
             THEN c.veh_modelo || ' ' || c.veh_anio_desde
           ELSE c.veh_modelo || ' ' || c.veh_anio_desde || '–' || c.veh_anio_hasta
         END,
         c.veh_anio_desde, c.veh_anio_hasta, c.veh_version
    FROM coincide c
    LEFT JOIN public.familias f ON f.id = c.familia
    LEFT JOIN public.sistemas s ON s.id = f.sistema
   ORDER BY (c.quantity > 0) DESC, s.orden NULLS LAST, f.orden NULLS LAST, c.name
   LIMIT greatest(1, least(p_limit, 500));
$$;

REVOKE ALL ON FUNCTION public.vehiculo_versiones(text, text) FROM public;
REVOKE ALL ON FUNCTION public.vehiculo_rangos(text, text) FROM public;
REVOKE ALL ON FUNCTION public.nombrar_version(text, text, int, int, text) FROM public;
REVOKE ALL ON FUNCTION public.piezas_por_vehiculo(text, text, int, text, boolean, int, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.vehiculo_versiones(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vehiculo_rangos(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nombrar_version(text, text, int, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.piezas_por_vehiculo(text, text, int, text, boolean, int, text, text) TO authenticated;
