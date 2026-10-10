-- The vehicle search returns the part's brand, for the register's brand
-- chips (GROB, YOKOMITSU). A new result column: drop first.
DROP FUNCTION IF EXISTS public.piezas_por_vehiculo(text, text, int, text, boolean, int, text, text);

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
  version        text,
  brand          text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH rango AS (
    -- The years the asked-for version covers, from the tags that carry it.
    SELECT min(t.veh_anio_desde) AS d,
           max(coalesce(t.veh_anio_hasta, t.veh_anio_desde)) AS h
      FROM public.tags t
     WHERE p_version IS NOT NULL
       AND t.veh_marca = p_marca
       AND (p_modelo IS NULL OR t.veh_modelo = p_modelo)
       AND t.veh_version = p_version
  ),
  coincide AS (
    SELECT DISTINCT ON (p.id)
      p.id, p.inventory_id, p.sku, p.name, p.image_url, p.price_cents, p.cost_cents,
      p.quantity, p.familia, p.brand,
      -- The owner's system for the piece; the one guessed from its name only
      -- where he has not set one.
      coalesce(p.sistema, fx.sistema) AS sistema,
      t.veh_modelo, t.veh_anio_desde, t.veh_anio_hasta, t.veh_version,
      pt.condicion
    FROM public.products p
    JOIN public.product_tags pt ON pt.product_id = p.id
    JOIN public.tags t ON t.id = pt.tag_id
    LEFT JOIN public.familias fx ON fx.id = p.familia
    CROSS JOIN rango r
   WHERE p.is_active
     AND t.veh_marca = p_marca
     AND (p_modelo IS NULL OR t.veh_modelo = p_modelo)
     AND (
       p_version IS NULL
       OR t.veh_version = p_version
       -- A range that spans two generations belongs to both.
       OR (
         t.veh_version IS NULL
         AND (
           t.veh_anio_desde IS NULL
           OR r.d IS NULL
           OR (t.veh_anio_desde < r.h AND coalesce(t.veh_anio_hasta, t.veh_anio_desde) > r.d)
         )
       )
     )
     AND (
       p_anio IS NULL
       OR t.veh_anio_desde IS NULL
       OR p_anio BETWEEN t.veh_anio_desde AND coalesce(t.veh_anio_hasta, t.veh_anio_desde)
     )
     AND (p_familia IS NULL OR p.familia = p_familia)
     AND (p_sistema IS NULL OR coalesce(p.sistema, fx.sistema) = p_sistema)
     AND (NOT p_solo_stock OR p.quantity > 0)
   ORDER BY p.id, t.veh_version NULLS LAST, t.veh_anio_desde DESC NULLS LAST
  )
  SELECT c.id, c.inventory_id, c.sku, c.name, c.image_url, c.price_cents, c.cost_cents,
         c.quantity, c.familia, f.nombre, c.sistema, s.nombre,
         CASE
           WHEN c.veh_anio_desde IS NULL THEN c.veh_modelo
           WHEN c.veh_anio_hasta IS NULL OR c.veh_anio_hasta = c.veh_anio_desde
             THEN c.veh_modelo || ' ' || c.veh_anio_desde
           ELSE c.veh_modelo || ' ' || c.veh_anio_desde || '–' || c.veh_anio_hasta
         END
         -- "con ABS", "lado derecho": the condition the owner wrote down.
         || coalesce(' · ' || c.condicion, ''),
         c.veh_anio_desde, c.veh_anio_hasta, c.veh_version, c.brand
    FROM coincide c
    LEFT JOIN public.familias f ON f.id = c.familia
    LEFT JOIN public.sistemas s ON s.id = c.sistema
   ORDER BY (c.quantity > 0) DESC, s.orden NULLS LAST, f.orden NULLS LAST, c.name
   LIMIT greatest(1, least(p_limit, 500));
$$;

REVOKE ALL ON FUNCTION public.piezas_por_vehiculo(text, text, int, text, boolean, int, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.piezas_por_vehiculo(text, text, int, text, boolean, int, text, text) TO authenticated;
