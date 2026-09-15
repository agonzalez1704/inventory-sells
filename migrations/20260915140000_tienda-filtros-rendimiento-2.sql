-- Second pass on the storefront filter functions, measured on Ruli (21k
-- products, warm). work_mem cannot be raised — InsForge refuses session
-- configuration — so the fixes shrink what gets sorted instead.
--
-- 1. tienda_catalogo carried p.* (busqueda, tags_texto, …) through the GROUP
--    BY, and that sort spilled to disk: 440 ms. Only the nine columns the
--    cards read: 47 ms.
-- 2. The counts are count(DISTINCT grupo) over text, i.e. collation-aware
--    string sorts, ten of them: ~525 ms. The same over a 64-bit hash of the
--    key: ~160 ms.
--    ponytail: a hash collision would merge two models in one count; at ~18k
--    keys in 2^64 the odds are ~1e-11. Switch to a surrogate id if that ever
--    stops being true.
--
-- tienda_match changes its return type, so it is dropped and recreated. Its
-- only callers run it through EXECUTE, so nothing holds a dependency on it.

DROP FUNCTION IF EXISTS public.tienda_match(jsonb, uuid[]);
CREATE FUNCTION public.tienda_match(p_f jsonb, p_ids uuid[])
RETURNS TABLE (
  id uuid, grupo bigint, disponible boolean,
  ok_cat boolean, ok_marca boolean, ok_cal boolean, ok_marco boolean,
  ok_stock boolean, ok_veh boolean, ok_tag boolean
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.id,
    -- A model, the unit the storefront lists: same key tienda_catalogo groups by.
    hashtextextended(coalesce(p.brand, '') || '|' || coalesce(p.category, '') || '|' || p.modelo, 0),
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
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $fn$
BEGIN
  RETURN QUERY EXECUTE $q$
    WITH vendidas AS (
      SELECT si.product_id, sum(si.qty) AS piezas
        FROM public.sale_items si
        JOIN public.sales s ON s.id = si.sale_id AND s.status = 'completed'
       GROUP BY si.product_id
    ),
    filtrados AS (
      SELECT p.id, p.name, p.modelo, p.brand, p.category, p.calidad,
             p.price_cents, p.quantity, p.image_url,
             i.entrega_dias_habiles, coalesce(i.es_dropship, false) AS es_dropship
        FROM public.tienda_match($1, $2) m
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
    SELECT a.modelo::text, a.brand::text, a.category::text, a.imagen::text,
           a.desde_cents::integer, a.variantes,
           (CASE WHEN a.piezas_top > 0 THEN a.mejor END)::uuid AS mas_vendida,
           count(*) OVER () AS total
      FROM agrupados a
     ORDER BY a.hay_stock DESC, a.hay_precio DESC, a.modelo
     LIMIT greatest(1, least(coalesce($3, 24), 1000))
    OFFSET greatest(0, coalesce($4, 0))
  $q$ USING p_f, p_ids, p_limit, p_offset;
END;
$fn$;
