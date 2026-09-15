-- Same two storefront functions, same signatures, planned with real values.
--
-- As LANGUAGE sql they planned their body once with p_f as an opaque parameter,
-- so none of the "this filter is not on" branches could fold away: every row
-- paid for every filter, vehicle EXISTS included. Measured on Ruli (21k
-- products), warm: listing 1.6–2.5 s and counts ~670 ms, against 31 ms / 12 ms
-- for the single-value functions they replace — while the identical body with
-- literal values ran in 112 ms.
--
-- RETURN QUERY EXECUTE … USING gets a one-shot plan whose parameters are
-- constants, so the planner drops absent filters entirely. The query text is a
-- fixed string — the values only ever travel through USING, never format().
-- Signatures are unchanged, so the deployed code keeps calling them.

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
      SELECT p.*, i.entrega_dias_habiles, coalesce(i.es_dropship, false) AS es_dropship
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
      SELECT j.grupo, t.veh_marca, t.veh_modelo, t.veh_anio_desde, t.veh_anio_hasta
        FROM j
        JOIN public.product_tags pt ON pt.product_id = j.id
        JOIN public.tags t ON t.id = pt.tag_id AND t.veh_marca IS NOT NULL
       WHERE j.ok_cat AND j.ok_marca AND j.ok_cal AND j.ok_marco AND j.ok_stock AND j.ok_tag
    )
    SELECT 'total'::text, NULL::text, count(DISTINCT grupo) FROM j
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
     WHERE j.ok_cat AND j.ok_marca AND j.ok_cal AND j.ok_marco AND j.ok_stock AND j.ok_veh
     GROUP BY t.nombre
  $q$ USING p_f, p_ids;
END;
$fn$;
