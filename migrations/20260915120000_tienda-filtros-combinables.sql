-- Combinable storefront filters with contextual counts.
--
-- Before: one value per filter (?marca=SAMSUNG) and facet counts over the whole
-- catalog, so a chip said "Samsung 135" while the search on screen had one
-- Samsung result — the numbers answered a question nobody asked. Now every
-- filter takes several values (OR inside a filter, AND across filters) and each
-- count is what the customer would get by adding that option to what they
-- already have on: the standard disjunctive-facet rule, where a dimension's own
-- selection does not narrow its own counts.
--
-- One definition of "matches": tienda_match returns a flag per filter for every
-- product, and both the listing (all flags) and the counts (all flags but one)
-- read it. Filters travel as one jsonb so adding a dimension later does not
-- change a signature — changing an RPC signature is what breaks deployed code.
--
-- Additive: tienda_modelos / tienda_facetas stay until the new code is live.

-- Frame is in the name, like quality. Fiable only; no Ruli name carries C/M.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS marco text GENERATED ALWAYS AS (
    CASE
      WHEN upper(name) ~ '\yC/M\y' THEN 'Con marco'
      WHEN upper(name) ~ '\yS/M\y' THEN 'Sin marco'
    END
  ) STORED;

-- Vehicle tags are "Make Model YYYY" or "Make Model YYYY-YYYY" (ACES seed).
-- Parsed once into columns so Marca → Modelo → Año filters are plain equality
-- and a range check. Five makes are two words; everything else splits on the
-- first space. A tag without a trailing year is a free-form label, not a
-- vehicle, and keeps all four columns null.
ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS veh_marca text GENERATED ALWAYS AS (
    CASE WHEN nombre ~ '\s(19|20)\d{2}(-(19|20)\d{2})?$' THEN coalesce(
      substring(nombre from '^(Western Star|American Motors|Land Rover|Blue Bird|Alfa Romeo)\s'),
      split_part(nombre, ' ', 1))
    END
  ) STORED,
  ADD COLUMN IF NOT EXISTS veh_modelo text GENERATED ALWAYS AS (
    CASE WHEN nombre ~ '\s(19|20)\d{2}(-(19|20)\d{2})?$' THEN nullif(btrim(regexp_replace(
      regexp_replace(nombre, '\s(19|20)\d{2}(-(19|20)\d{2})?$', ''),
      '^(Western Star|American Motors|Land Rover|Blue Bird|Alfa Romeo|\S+)\s*', '')), '')
    END
  ) STORED,
  ADD COLUMN IF NOT EXISTS veh_anio_desde integer GENERATED ALWAYS AS (
    substring(nombre from '\s((?:19|20)\d{2})(?:-(?:19|20)\d{2})?$')::integer
  ) STORED,
  ADD COLUMN IF NOT EXISTS veh_anio_hasta integer GENERATED ALWAYS AS (
    coalesce(
      substring(nombre from '\s(?:19|20)\d{2}-((?:19|20)\d{2})$'),
      substring(nombre from '\s((?:19|20)\d{2})$'))::integer
  ) STORED;

CREATE INDEX IF NOT EXISTS tags_vehiculo_idx
  ON public.tags (veh_marca, veh_modelo) WHERE veh_marca IS NOT NULL;

-- p_f keys (absent = no filter; the client never sends empty ones):
--   cat, marca, cal, marco, tag : string arrays, OR within
--   vmarca, vmodelo              : strings
--   anio                         : integer, inside the tag's year range
--   stock                        : true = only what can be sold now
-- p_ids: the search's candidates (already relevance-scored in JS); null = browse.
--
-- No SET search_path on purpose: it would stop the planner from inlining this
-- into its callers, and it is only ever called by the two functions below.
CREATE OR REPLACE FUNCTION public.tienda_match(p_f jsonb, p_ids uuid[])
RETURNS TABLE (
  id uuid, grupo text, disponible boolean,
  ok_cat boolean, ok_marca boolean, ok_cal boolean, ok_marco boolean,
  ok_stock boolean, ok_veh boolean, ok_tag boolean
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.id,
    -- A model, the unit the storefront lists: same key as tienda_modelos groups by.
    coalesce(p.brand, '') || '|' || coalesce(p.category, '') || '|' || p.modelo,
    (p.quantity > 0 OR coalesce(i.es_dropship, false)),
    (NOT (p_f ? 'cat')   OR coalesce((p_f -> 'cat')   ? p.category, false)),
    (NOT (p_f ? 'marca') OR coalesce((p_f -> 'marca') ? p.brand,    false)),
    (NOT (p_f ? 'cal')   OR coalesce((p_f -> 'cal')   ? p.calidad,  false)),
    (NOT (p_f ? 'marco') OR coalesce((p_f -> 'marco') ? p.marco,    false)),
    (NOT coalesce((p_f ->> 'stock')::boolean, false)
       OR p.quantity > 0 OR coalesce(i.es_dropship, false)),
    -- One tag must satisfy make, model and year together: a part tagged
    -- "Nissan Tsuru 1992" and "Ford Lobo 2010" does not fit a Tsuru 2010.
    (NOT (p_f ? 'vmarca' OR p_f ? 'vmodelo' OR p_f ? 'anio') OR EXISTS (
      SELECT 1
        FROM public.product_tags pt
        JOIN public.tags t ON t.id = pt.tag_id
       WHERE pt.product_id = p.id
         AND t.veh_marca IS NOT NULL
         AND (NOT (p_f ? 'vmarca')  OR t.veh_marca  = p_f ->> 'vmarca')
         AND (NOT (p_f ? 'vmodelo') OR t.veh_modelo = p_f ->> 'vmodelo')
         AND (NOT (p_f ? 'anio')
              OR (p_f ->> 'anio')::integer BETWEEN t.veh_anio_desde AND t.veh_anio_hasta))),
    (NOT (p_f ? 'tag') OR EXISTS (
      SELECT 1
        FROM public.product_tags pt
        JOIN public.tags t ON t.id = pt.tag_id
       WHERE pt.product_id = p.id
         AND t.veh_marca IS NULL
         AND (p_f -> 'tag') ? t.nombre))
  FROM public.products p
  LEFT JOIN public.inventories i ON i.id = p.inventory_id
  WHERE p.is_active
    AND (p_ids IS NULL OR p.id = ANY (p_ids));
$$;

-- tienda_modelos with combinable filters and an optional candidate set. Same
-- output shape, so the cards read it unchanged.
CREATE OR REPLACE FUNCTION public.tienda_catalogo(
  p_f      jsonb,
  p_ids    uuid[],
  p_limit  integer,
  p_offset integer
)
RETURNS TABLE (
  modelo      text,
  brand       text,
  category    text,
  imagen      text,
  desde_cents integer,
  variantes   jsonb,
  mas_vendida uuid,
  total       bigint
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH vendidas AS (
    SELECT si.product_id, sum(si.qty) AS piezas
      FROM public.sale_items si
      JOIN public.sales s ON s.id = si.sale_id AND s.status = 'completed'
     GROUP BY si.product_id
  ),
  filtrados AS (
    SELECT p.*, i.entrega_dias_habiles, coalesce(i.es_dropship, false) AS es_dropship
      FROM public.tienda_match(p_f, p_ids) m
      JOIN public.products p ON p.id = m.id
      LEFT JOIN public.inventories i ON i.id = p.inventory_id
     WHERE m.ok_cat AND m.ok_marca AND m.ok_cal AND m.ok_marco
       AND m.ok_stock AND m.ok_veh AND m.ok_tag
  ),
  agrupados AS (
    SELECT
      f.modelo,
      f.brand,
      f.category,
      (array_remove(array_agg(f.image_url ORDER BY f.image_url), NULL))[1] AS imagen,
      min(f.price_cents) FILTER (WHERE f.price_cents > 0) AS desde_cents,
      max((f.quantity > 0 OR f.es_dropship)::int) AS hay_stock,
      max((f.price_cents > 0)::int) AS hay_precio,
      jsonb_agg(
        jsonb_build_object(
          'id', f.id,
          'nombre', f.name,
          'calidad', f.calidad,
          'precio_cents', f.price_cents,
          'disponible', f.quantity > 0 OR f.es_dropship,
          'ultima', f.quantity = 1 AND NOT f.es_dropship,
          'imagen', f.image_url,
          'entrega_dias', f.entrega_dias_habiles
        )
        ORDER BY f.price_cents, f.name
      ) AS variantes,
      (array_agg(f.id ORDER BY coalesce(v.piezas, 0) DESC, f.price_cents))[1] AS mejor,
      max(coalesce(v.piezas, 0)) AS piezas_top
    FROM filtrados f
    LEFT JOIN vendidas v ON v.product_id = f.id
    GROUP BY f.modelo, f.brand, f.category
  )
  SELECT a.modelo, a.brand, a.category, a.imagen, a.desde_cents, a.variantes,
         CASE WHEN a.piezas_top > 0 THEN a.mejor END AS mas_vendida,
         count(*) OVER () AS total
    FROM agrupados a
   ORDER BY a.hay_stock DESC, a.hay_precio DESC, a.modelo
   LIMIT greatest(1, least(coalesce(p_limit, 24), 1000))
  OFFSET greatest(0, coalesce(p_offset, 0));
$$;

-- Every count the filter panel shows, in one round trip. Counts are models
-- (distinct grupo), the unit the list shows, so "Pantallas 3" means three rows.
--   tipo 'total'   : models matching everything that is on
--   tipo 'stock'   : of those ignoring the stock toggle, how many can be sold now
--   tipo 'vmodelo' : only once a make is chosen; 'anio' only once a model is
CREATE OR REPLACE FUNCTION public.tienda_facetas_ctx(p_f jsonb, p_ids uuid[])
RETURNS TABLE (tipo text, valor text, n bigint)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH j AS MATERIALIZED (
    SELECT m.*, p.category, p.brand, p.calidad, p.marco
      FROM public.tienda_match(p_f, p_ids) m
      JOIN public.products p ON p.id = m.id
  ),
  vt AS (
    -- Vehicle tags of the products that pass every non-vehicle filter.
    SELECT j.grupo, t.veh_marca, t.veh_modelo, t.veh_anio_desde, t.veh_anio_hasta
      FROM j
      JOIN public.product_tags pt ON pt.product_id = j.id
      JOIN public.tags t ON t.id = pt.tag_id AND t.veh_marca IS NOT NULL
     WHERE j.ok_cat AND j.ok_marca AND j.ok_cal AND j.ok_marco AND j.ok_stock AND j.ok_tag
  )
  SELECT 'total', NULL, count(DISTINCT grupo) FROM j
   WHERE ok_cat AND ok_marca AND ok_cal AND ok_marco AND ok_stock AND ok_veh AND ok_tag
  UNION ALL
  SELECT 'stock', NULL, count(DISTINCT grupo) FROM j
   WHERE disponible AND ok_cat AND ok_marca AND ok_cal AND ok_marco AND ok_veh AND ok_tag
  UNION ALL
  SELECT 'cat', category, count(DISTINCT grupo) FILTER (
           WHERE ok_marca AND ok_cal AND ok_marco AND ok_stock AND ok_veh AND ok_tag)
    FROM j WHERE category IS NOT NULL AND category <> '' GROUP BY category
  UNION ALL
  SELECT 'marca', brand, count(DISTINCT grupo) FILTER (
           WHERE ok_cat AND ok_cal AND ok_marco AND ok_stock AND ok_veh AND ok_tag)
    FROM j WHERE brand IS NOT NULL AND brand <> '' GROUP BY brand
  UNION ALL
  SELECT 'cal', calidad, count(DISTINCT grupo) FILTER (
           WHERE ok_cat AND ok_marca AND ok_marco AND ok_stock AND ok_veh AND ok_tag)
    FROM j WHERE calidad IS NOT NULL GROUP BY calidad
  UNION ALL
  SELECT 'marco', marco, count(DISTINCT grupo) FILTER (
           WHERE ok_cat AND ok_marca AND ok_cal AND ok_stock AND ok_veh AND ok_tag)
    FROM j WHERE marco IS NOT NULL GROUP BY marco
  UNION ALL
  -- Makes ignore the whole vehicle selection: switching make must show them all.
  SELECT 'vmarca', veh_marca, count(DISTINCT grupo) FROM vt GROUP BY veh_marca
  UNION ALL
  SELECT 'vmodelo', veh_modelo, count(DISTINCT grupo) FROM vt
   WHERE p_f ? 'vmarca' AND veh_marca = p_f ->> 'vmarca' AND veh_modelo IS NOT NULL
   GROUP BY veh_modelo
  UNION ALL
  SELECT 'anio', y::text, count(DISTINCT grupo)
    FROM vt, generate_series(veh_anio_desde, veh_anio_hasta) y
   WHERE p_f ? 'vmodelo' AND veh_marca = p_f ->> 'vmarca' AND veh_modelo = p_f ->> 'vmodelo'
   GROUP BY y
  UNION ALL
  SELECT 'tag', t.nombre, count(DISTINCT j.grupo)
    FROM j
    JOIN public.product_tags pt ON pt.product_id = j.id
    JOIN public.tags t ON t.id = pt.tag_id AND t.veh_marca IS NULL
   WHERE j.ok_cat AND j.ok_marca AND j.ok_cal AND j.ok_marco AND j.ok_stock AND j.ok_veh
   GROUP BY t.nombre;
$$;

GRANT EXECUTE ON FUNCTION public.tienda_catalogo(jsonb, uuid[], integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tienda_facetas_ctx(jsonb, uuid[]) TO anon, authenticated;
