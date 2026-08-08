-- Stop the public storefront from reading the whole catalog on every request.
--
-- /tienda selected all 21k active products and then searched, filtered,
-- counted the facets and paginated in Node — about 2.7 MB out of the database
-- per page load, on a route with no session that anything on the internet can
-- hit. That is what filled the egress quota.
--
-- Facets have to be counted over the WHOLE catalog (otherwise the chips vanish
-- as you filter), which is precisely the thing you do not want to do by
-- shipping the catalog. So it moves into SQL, where counting 21k rows costs no
-- egress at all and only the ~220 totals travel.
--
-- Additive on purpose — a new column and a new function. The deployed code
-- keeps working against this schema, so it can be applied before the code
-- ships instead of the other way round.

-- Quality is read from the product name. It already lives in lib/calidad.ts,
-- and this is a second copy of that heuristic — kept honest by
-- scripts/test-calidad.ts, which compares both against the real catalog.
-- The CASE order matters: a name saying "ORIGINAL OLED" is an Original.
ALTER TABLE public.products
  ADD COLUMN calidad text GENERATED ALWAYS AS (
    CASE
      WHEN upper(name) ~ '\yORIGINAL\y|\yORG\y|\yOEM\y' THEN 'Original'
      WHEN upper(name) ~ '\yOLED\y'                     THEN 'OLED'
      WHEN upper(name) ~ '\yINCELL\y'                   THEN 'Incell'
      WHEN upper(name) ~ '\yAAA\y'                      THEN 'AAA'
    END
  ) STORED;

-- The storefront's browse ordering, so the database can sort and slice instead
-- of Node sorting 21k rows to show 24 of them.
CREATE INDEX products_tienda_orden_idx
  ON public.products ((quantity > 0) DESC, (price_cents > 0) DESC, name)
  WHERE is_active;

CREATE INDEX products_tienda_categoria_idx ON public.products (category) WHERE is_active;
CREATE INDEX products_tienda_calidad_idx   ON public.products (calidad)  WHERE is_active;

-- Every facet in one round trip: three group-bys stacked, tagged by which
-- filter they belong to. Roughly 220 rows for Ruli against 21,015 products.
CREATE OR REPLACE FUNCTION public.tienda_facetas()
RETURNS TABLE (tipo text, valor text, n bigint)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT 'brand', brand, count(*) FROM public.products
   WHERE is_active AND brand IS NOT NULL AND brand <> '' GROUP BY brand
  UNION ALL
  SELECT 'category', category, count(*) FROM public.products
   WHERE is_active AND category IS NOT NULL AND category <> '' GROUP BY category
  UNION ALL
  SELECT 'calidad', calidad, count(*) FROM public.products
   WHERE is_active AND calidad IS NOT NULL GROUP BY calidad
$$;

GRANT EXECUTE ON FUNCTION public.tienda_facetas() TO authenticated;

-- One page of the storefront: filtered, ordered, counted and sliced in SQL.
--
-- The ordering is on the PREDICATES, not the magnitudes — anything in stock
-- ranks over anything out of it, and 500 pieces is not "more in stock" than 1.
-- That distinction is why this is a function: PostgREST's order() takes column
-- names, so expressing it through the query builder would have quietly sorted
-- by quantity instead.
--
-- count(*) OVER () carries the size of the filtered set on every row, so the
-- pager needs no second round trip.
CREATE OR REPLACE FUNCTION public.tienda_lista(
  p_marca     text DEFAULT NULL,
  p_categoria text DEFAULT NULL,
  p_calidad   text DEFAULT NULL,
  p_limit     int  DEFAULT 24,
  p_offset    int  DEFAULT 0
)
RETURNS TABLE (
  id uuid, name text, brand text, category text, sku text,
  price_cents int, quantity int, image_url text, total bigint
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT p.id, p.name, p.brand, p.category, p.sku,
         p.price_cents, p.quantity, p.image_url,
         count(*) OVER () AS total
    FROM public.products p
   WHERE p.is_active
     AND (p_marca     IS NULL OR p.brand    = p_marca)
     AND (p_categoria IS NULL OR p.category = p_categoria)
     AND (p_calidad   IS NULL OR p.calidad  = p_calidad)
   ORDER BY (p.quantity > 0) DESC, (p.price_cents > 0) DESC, p.name
   LIMIT p_limit OFFSET p_offset
$$;

GRANT EXECUTE ON FUNCTION public.tienda_lista(text, text, text, int, int) TO authenticated;
