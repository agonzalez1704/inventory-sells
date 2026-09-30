-- Touching a generation's last year is not spanning it.
--
-- The catalog changes generation ON a year, so ranges meet there: the Versa's
-- first generation ends 2012 and a "Versa 2012-2023" tag begins 2012. Counting
-- that tag as part of the first generation dragged 33 pieces of the second one
-- into it -- 76 of the model's 102 parts under "1a generacion", which is no
-- answer at all.
--
-- So the overlap has to be real, not a shared boundary year: a range belongs to
-- a version when it starts BEFORE the version's last year and ends AFTER its
-- first. A genuinely two-generation range like "Versa 2007-2023" still reaches
-- both, which is the whole point.

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
  WITH v AS (
    SELECT t.veh_version AS version,
           min(t.veh_anio_desde) AS d,
           max(coalesce(t.veh_anio_hasta, t.veh_anio_desde)) AS h,
           count(*)::int AS etiquetas
      FROM public.tags t
     WHERE t.veh_marca = p_marca AND t.veh_modelo = p_modelo
     GROUP BY t.veh_version
  )
  -- The count the chip shows is the count the search returns: same rule.
  SELECT v.version,
         (SELECT count(DISTINCT pt.product_id)::int
            FROM public.tags t
            JOIN public.product_tags pt ON pt.tag_id = t.id
            JOIN public.products p ON p.id = pt.product_id AND p.is_active
           WHERE t.veh_marca = p_marca AND t.veh_modelo = p_modelo
             AND (
               t.veh_version IS NOT DISTINCT FROM v.version
               OR (
                 v.version IS NOT NULL AND t.veh_version IS NULL
                 AND (
                   t.veh_anio_desde IS NULL
                   OR (t.veh_anio_desde < v.h AND coalesce(t.veh_anio_hasta, t.veh_anio_desde) > v.d)
                 )
               )
             )),
         v.d::int,
         v.h::int,
         v.etiquetas
    FROM v
   ORDER BY v.d NULLS LAST;
$$;

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
      p.quantity, p.familia,
      t.veh_modelo, t.veh_anio_desde, t.veh_anio_hasta, t.veh_version
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
     AND (p_sistema IS NULL OR fx.sistema = p_sistema)
     AND (NOT p_solo_stock OR p.quantity > 0)
   ORDER BY p.id, t.veh_version NULLS LAST, t.veh_anio_desde DESC NULLS LAST
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
