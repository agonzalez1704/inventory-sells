-- Search the way the counter asks: "¿qué carro trae?"
--
-- Ruli already carries 8,953 vehicles on its tags — make, model and a year
-- range each — and 10,752 of its parts are tied to one. What was missing is
-- the path from the car to the part: these four functions are the cascade
-- (makes → models → years) and the search itself.
--
-- The year is compared against the RANGE, never as text: a 2013 Versa gets the
-- 2012–2017 parts and not the 2007–2012 ones.

CREATE INDEX IF NOT EXISTS tags_vehiculo_idx
  ON public.tags (veh_marca, veh_modelo, veh_anio_desde, veh_anio_hasta)
  WHERE veh_marca IS NOT NULL;

/** Makes that actually have parts in this shop, most stocked first. */
CREATE OR REPLACE FUNCTION public.vehiculo_marcas()
RETURNS TABLE (marca text, piezas int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT t.veh_marca, count(DISTINCT pt.product_id)::int
    FROM public.tags t
    JOIN public.product_tags pt ON pt.tag_id = t.id
    JOIN public.products p ON p.id = pt.product_id AND p.is_active
   WHERE t.veh_marca IS NOT NULL
   GROUP BY t.veh_marca
   ORDER BY t.veh_marca;
$$;

/** Models of one make, as the shop actually stocks them. */
CREATE OR REPLACE FUNCTION public.vehiculo_modelos(p_marca text)
RETURNS TABLE (modelo text, piezas int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT t.veh_modelo, count(DISTINCT pt.product_id)::int
    FROM public.tags t
    JOIN public.product_tags pt ON pt.tag_id = t.id
    JOIN public.products p ON p.id = pt.product_id AND p.is_active
   WHERE t.veh_marca = p_marca AND t.veh_modelo IS NOT NULL
   GROUP BY t.veh_modelo
   ORDER BY t.veh_modelo;
$$;

/**
 * Every year the shop has something for, one row each.
 *
 * The tags carry ranges; the counter thinks in a single year ("un Versa 2013"),
 * so the ranges are expanded — capped at 1980–2030 so one bad row cannot
 * produce a list of centuries.
 */
CREATE OR REPLACE FUNCTION public.vehiculo_anios(p_marca text, p_modelo text)
RETURNS TABLE (anio int, piezas int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT a.anio::int, count(DISTINCT pt.product_id)::int
    FROM public.tags t
    JOIN public.product_tags pt ON pt.tag_id = t.id
    JOIN public.products p ON p.id = pt.product_id AND p.is_active
   CROSS JOIN LATERAL generate_series(
     greatest(coalesce(t.veh_anio_desde, 1980), 1980),
     least(coalesce(t.veh_anio_hasta, t.veh_anio_desde, 2030), 2030)
   ) AS a(anio)
   WHERE t.veh_marca = p_marca AND t.veh_modelo = p_modelo
   GROUP BY a.anio
   ORDER BY a.anio DESC;
$$;

/**
 * The parts for one car.
 *
 * Returns the product rows themselves (one per inventory, as the catalog holds
 * them) with the range that matched — "2012–2017" is what the counter reads
 * back to the customer — and the family, for the chips above the results.
 */
CREATE OR REPLACE FUNCTION public.piezas_por_vehiculo(
  p_marca      text,
  p_modelo     text DEFAULT NULL,
  p_anio       int  DEFAULT NULL,
  p_familia    text DEFAULT NULL,
  p_solo_stock boolean DEFAULT false,
  p_limit      int  DEFAULT 300
)
RETURNS TABLE (
  id            uuid,
  inventory_id  uuid,
  sku           text,
  name          text,
  image_url     text,
  price_cents   int,
  cost_cents    int,
  quantity      int,
  familia       text,
  familia_nombre text,
  compat        text,
  anio_desde    int,
  anio_hasta    int
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
      t.veh_modelo, t.veh_anio_desde, t.veh_anio_hasta
    FROM public.products p
    JOIN public.product_tags pt ON pt.product_id = p.id
    JOIN public.tags t ON t.id = pt.tag_id
   WHERE p.is_active
     AND t.veh_marca = p_marca
     AND (p_modelo IS NULL OR t.veh_modelo = p_modelo)
     AND (
       p_anio IS NULL
       OR t.veh_anio_desde IS NULL
       OR p_anio BETWEEN t.veh_anio_desde AND coalesce(t.veh_anio_hasta, t.veh_anio_desde)
     )
     AND (p_familia IS NULL OR p.familia = p_familia)
     AND (NOT p_solo_stock OR p.quantity > 0)
   ORDER BY p.id, t.veh_anio_desde DESC NULLS LAST
  )
  SELECT c.id, c.inventory_id, c.sku, c.name, c.image_url, c.price_cents, c.cost_cents,
         c.quantity, c.familia, f.nombre,
         CASE
           WHEN c.veh_anio_desde IS NULL THEN c.veh_modelo
           WHEN c.veh_anio_hasta IS NULL OR c.veh_anio_hasta = c.veh_anio_desde
             THEN c.veh_modelo || ' ' || c.veh_anio_desde
           ELSE c.veh_modelo || ' ' || c.veh_anio_desde || '–' || c.veh_anio_hasta
         END,
         c.veh_anio_desde, c.veh_anio_hasta
    FROM coincide c
    LEFT JOIN public.familias f ON f.id = c.familia
   ORDER BY (c.quantity > 0) DESC, f.orden NULLS LAST, c.name
   LIMIT greatest(1, least(p_limit, 500));
$$;

REVOKE ALL ON FUNCTION public.vehiculo_marcas() FROM public;
REVOKE ALL ON FUNCTION public.vehiculo_modelos(text) FROM public;
REVOKE ALL ON FUNCTION public.vehiculo_anios(text, text) FROM public;
REVOKE ALL ON FUNCTION public.piezas_por_vehiculo(text, text, int, text, boolean, int) FROM public;
GRANT EXECUTE ON FUNCTION public.vehiculo_marcas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.vehiculo_modelos(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vehiculo_anios(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.piezas_por_vehiculo(text, text, int, text, boolean, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.familia_de(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalizar_pieza(text) TO authenticated;
