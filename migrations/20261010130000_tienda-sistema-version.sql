-- Store filters for the owner's catalog: Sistema, and Versión when a model
-- has more than one.
--
-- tienda_match gains ok_sis (the part's system: the owner's, else its family's)
-- and reads a version inside the vehicle check; tienda_catalogo and
-- tienda_facetas_ctx carry the new flag, and the facets add 'sis' and
-- 'version'. Families that pointed at Transmisión or Otros lose that system:
-- the owner works with twelve systems and those two are not among them.

UPDATE public.familias SET sistema = NULL WHERE sistema IN ('transmision', 'otros');

DROP FUNCTION IF EXISTS public.tienda_match(jsonb, uuid[]);
CREATE FUNCTION public.tienda_match(p_f jsonb, p_ids uuid[])
RETURNS TABLE (
  id uuid, grupo bigint, disponible boolean,
  ok_cat boolean, ok_marca boolean, ok_cal boolean, ok_marco boolean,
  ok_stock boolean, ok_veh boolean, ok_tag boolean,
  ok_sis boolean, sis text
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
              OR (p_f ->> 'anio')::integer BETWEEN t.veh_anio_desde AND t.veh_anio_hasta)
         -- A version picks its own bands; an unnamed band fits every version
         -- of the years it covers (the year check above still applies).
         AND (NOT (p_f ? 'version') OR t.veh_version = p_f ->> 'version' OR t.veh_version IS NULL))),
    (NOT (p_f ? 'tag') OR EXISTS (
      SELECT 1
        FROM public.product_tags pt
        JOIN public.tags t ON t.id = pt.tag_id
       WHERE pt.product_id = p.id
         AND t.veh_marca IS NULL
         AND (p_f -> 'tag') ? t.nombre)),
    (NOT (p_f ? 'sis') OR coalesce((p_f -> 'sis') ? s.nombre, false)),
    s.nombre
  FROM public.products p
  LEFT JOIN public.inventories i ON i.id = p.inventory_id
  -- The owner's system for the part, else the one its family implies.
  LEFT JOIN public.familias f ON f.id = p.familia
  LEFT JOIN public.sistemas s ON s.id = coalesce(p.sistema, f.sistema)
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
    WITH filtrados AS MATERIALIZED (
      SELECT m.grupo, p.id, p.name, p.modelo, p.brand, p.category, p.calidad,
             p.price_cents, p.quantity, p.image_url,
             i.entrega_dias_habiles, coalesce(i.es_dropship, false) AS es_dropship,
             -- Pieces sold in the last 90 days, only for "Más vendidos".
             CASE WHEN $1 ->> 'orden' = 'vendidos' THEN (
               SELECT coalesce(sum(si.qty), 0)
                 FROM public.sale_items si
                 JOIN public.sales s ON s.id = si.sale_id
                  AND s.status = 'completed'
                  AND s.created_at >= now() - interval '90 days'
                WHERE si.product_id = p.id)
             END AS ventas
        FROM public.tienda_match($1, $2) m
        JOIN public.products p ON p.id = m.id
        LEFT JOIN public.inventories i ON i.id = p.inventory_id
       WHERE m.ok_cat AND m.ok_marca AND m.ok_cal AND m.ok_marco
         AND m.ok_stock AND m.ok_veh AND m.ok_tag AND m.ok_sis
    ),
    pagina AS (
      SELECT f.grupo, f.modelo, f.brand, f.category,
             max((f.quantity > 0 OR f.es_dropship)::int) AS hay_stock,
             max((f.price_cents > 0)::int) AS hay_precio,
             min(f.price_cents) FILTER (WHERE f.price_cents > 0) AS desde,
             sum(f.ventas) AS ventas,
             count(*) OVER () AS total
        FROM filtrados f
       GROUP BY f.grupo, f.modelo, f.brand, f.category
       ORDER BY hay_stock DESC,
                CASE WHEN $1 ->> 'orden' = 'vendidos' THEN sum(f.ventas) END DESC NULLS LAST,
                CASE WHEN $1 ->> 'orden' = 'precio_asc'
                     THEN min(f.price_cents) FILTER (WHERE f.price_cents > 0) END ASC NULLS LAST,
                CASE WHEN $1 ->> 'orden' = 'precio_desc'
                     THEN min(f.price_cents) FILTER (WHERE f.price_cents > 0) END DESC NULLS LAST,
                hay_precio DESC, f.modelo, f.brand, f.category
       LIMIT greatest(1, least(coalesce($3, 24), 1000))
      OFFSET greatest(0, coalesce($4, 0))
    ),
    vendidas AS (
      -- Which variant this shop actually sells, from its own sales. Null when
      -- the model has no history: a badge nobody earned is a claim.
      SELECT si.product_id, sum(si.qty) AS piezas
        FROM public.sale_items si
        JOIN public.sales s ON s.id = si.sale_id AND s.status = 'completed'
       WHERE si.product_id IN (SELECT f.id FROM filtrados f JOIN pagina g ON g.grupo = f.grupo)
       GROUP BY si.product_id
    )
    SELECT g.modelo::text, g.brand::text, g.category::text,
           (array_remove(array_agg(f.image_url ORDER BY f.image_url), NULL))[1]::text,
           (min(f.price_cents) FILTER (WHERE f.price_cents > 0))::integer,
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
           ),
           (CASE WHEN max(coalesce(v.piezas, 0)) > 0
                 THEN (array_agg(f.id ORDER BY coalesce(v.piezas, 0) DESC, f.price_cents))[1]
            END)::uuid,
           g.total
      FROM pagina g
      JOIN filtrados f ON f.grupo = g.grupo
      LEFT JOIN vendidas v ON v.product_id = f.id
     GROUP BY g.grupo, g.modelo, g.brand, g.category, g.total, g.hay_stock, g.hay_precio, g.desde, g.ventas
     ORDER BY g.hay_stock DESC,
              CASE WHEN $1 ->> 'orden' = 'vendidos' THEN g.ventas END DESC NULLS LAST,
              CASE WHEN $1 ->> 'orden' = 'precio_asc' THEN g.desde END ASC NULLS LAST,
              CASE WHEN $1 ->> 'orden' = 'precio_desc' THEN g.desde END DESC NULLS LAST,
              g.hay_precio DESC, g.modelo, g.brand, g.category
  $q$ USING p_f, p_ids, p_limit, p_offset;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.tienda_facetas_ctx(p_f jsonb, p_ids uuid[])
RETURNS TABLE (tipo text, valor text, n bigint)
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $fn$
BEGIN
  RETURN QUERY EXECUTE $q$
    WITH j AS MATERIALIZED (
      SELECT m.*, p.category, p.brand, p.calidad, p.marco
        FROM public.tienda_match($1, $2) m
        JOIN public.products p ON p.id = m.id
    ),
    vt AS (
      SELECT j.grupo, t.veh_marca, t.veh_modelo, t.veh_anio_desde, t.veh_anio_hasta, t.veh_version
        FROM j
        JOIN public.product_tags pt ON pt.product_id = j.id
        JOIN public.tags t ON t.id = pt.tag_id AND t.veh_marca IS NOT NULL
       WHERE j.ok_cat AND j.ok_marca AND j.ok_cal AND j.ok_marco AND j.ok_stock AND j.ok_tag AND j.ok_sis
    )
    SELECT 'total'::text, NULL::text, count(DISTINCT grupo) FROM j
     WHERE ok_cat AND ok_marca AND ok_cal AND ok_marco AND ok_stock AND ok_veh AND ok_tag AND ok_sis
    UNION ALL
    SELECT 'stock', NULL, count(DISTINCT grupo) FROM j
     WHERE disponible AND ok_cat AND ok_marca AND ok_cal AND ok_marco AND ok_veh AND ok_tag AND ok_sis
    UNION ALL
    SELECT 'cat', category, count(DISTINCT grupo) FILTER (
             WHERE ok_marca AND ok_cal AND ok_marco AND ok_stock AND ok_veh AND ok_tag AND ok_sis)
      FROM j WHERE category IS NOT NULL AND category <> '' GROUP BY category
    UNION ALL
    SELECT 'marca', brand, count(DISTINCT grupo) FILTER (
             WHERE ok_cat AND ok_cal AND ok_marco AND ok_stock AND ok_veh AND ok_tag AND ok_sis)
      FROM j WHERE brand IS NOT NULL AND brand <> '' GROUP BY brand
    UNION ALL
    SELECT 'cal', calidad, count(DISTINCT grupo) FILTER (
             WHERE ok_cat AND ok_marca AND ok_marco AND ok_stock AND ok_veh AND ok_tag AND ok_sis)
      FROM j WHERE calidad IS NOT NULL GROUP BY calidad
    UNION ALL
    SELECT 'marco', marco, count(DISTINCT grupo) FILTER (
             WHERE ok_cat AND ok_marca AND ok_cal AND ok_stock AND ok_veh AND ok_tag AND ok_sis)
      FROM j WHERE marco IS NOT NULL GROUP BY marco
    UNION ALL
    SELECT 'vmarca', veh_marca, count(DISTINCT grupo) FROM vt GROUP BY veh_marca
    UNION ALL
    SELECT 'vmodelo', veh_modelo, count(DISTINCT grupo) FROM vt
     WHERE $1 ? 'vmarca' AND veh_marca = $1 ->> 'vmarca' AND veh_modelo IS NOT NULL
     GROUP BY veh_modelo
    UNION ALL
    SELECT 'anio', y::text, count(DISTINCT grupo)
      FROM vt, generate_series(veh_anio_desde, veh_anio_hasta) y
     WHERE $1 ? 'vmodelo' AND veh_marca = $1 ->> 'vmarca' AND veh_modelo = $1 ->> 'vmodelo'
     GROUP BY y
    UNION ALL
    SELECT 'tag', t.nombre, count(DISTINCT j.grupo)
      FROM j
      JOIN public.product_tags pt ON pt.product_id = j.id
      JOIN public.tags t ON t.id = pt.tag_id AND t.veh_marca IS NULL
     WHERE j.ok_cat AND j.ok_marca AND j.ok_cal AND j.ok_marco AND j.ok_stock AND j.ok_veh AND j.ok_sis
     GROUP BY t.nombre
    UNION ALL
    -- Systems ignore their own selection, like every list filter.
    SELECT 'sis', sis, count(DISTINCT grupo) FILTER (
             WHERE ok_cat AND ok_marca AND ok_cal AND ok_marco AND ok_stock AND ok_veh AND ok_tag)
      FROM j WHERE sis IS NOT NULL GROUP BY sis
    UNION ALL
    -- The versions of the chosen model (and year, when there is one). The
    -- panel shows the choice only when there is more than one.
    SELECT 'version', veh_version, count(DISTINCT grupo) FROM vt
     WHERE $1 ? 'vmodelo' AND veh_marca = $1 ->> 'vmarca' AND veh_modelo = $1 ->> 'vmodelo'
       AND veh_version IS NOT NULL
       AND (NOT $1 ? 'anio' OR ($1 ->> 'anio')::integer BETWEEN veh_anio_desde AND veh_anio_hasta)
     GROUP BY veh_version
  $q$ USING p_f, p_ids;
END;
$fn$;
