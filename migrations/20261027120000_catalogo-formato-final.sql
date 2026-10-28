-- The owner's final sheet ("IA SAE LISTA FORMATO FINAL"): one vehicle per row,
-- with two new columns.
--
--   CILINDRADA  the engine a fit applies to ("1.6L", "1.8L 2.0L"). It belongs
--               to the fit, like the condition: the same part fits a Spark 1.2L
--               and a Beat 1.2L, and only some fits name an engine.
--   REFACCION   what the part IS, in his words (53 kinds, finer than the
--               name-derived families: "filtro aire" vs "filtro aceite"). It
--               lands in products.familia; familia_fija keeps a rename from
--               re-deriving it over his choice.

ALTER TABLE public.product_tags ADD COLUMN IF NOT EXISTS cilindrada text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS familia_fija boolean NOT NULL DEFAULT false;

-- Derive the family from the name only when nobody chose one: on insert
-- without a family, or on rename of a product whose family was derived.
CREATE OR REPLACE FUNCTION public.set_familia()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.familia IS NULL)
     OR (TG_OP = 'UPDATE' AND NEW.name IS DISTINCT FROM OLD.name AND NOT NEW.familia_fija) THEN
    NEW.familia := public.familia_de(NEW.name);
  END IF;
  RETURN NEW;
END;
$$;

-- The vehicle search reads the engine back with the fit.
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
      pt.condicion, pt.cilindrada
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
         -- "1.6L", then "con ABS": the engine and condition the owner wrote down.
         || coalesce(' ' || c.cilindrada, '')
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
