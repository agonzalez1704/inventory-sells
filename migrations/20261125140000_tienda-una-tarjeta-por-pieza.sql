-- Tienda: one card per piece, even when its rows disagree on the name.
--
-- tienda_match groups rows into one piece (Ruli: by SKU, one row per
-- inventory; Fiable: by brand + category + modelo). tienda_catalogo then
-- grouped again by modelo/brand/category, so a SKU whose Mostrador row was
-- named "5094018" and whose CEDIS LEON row was named "VIELETAS INT." showed
-- as two cards, each with both rows: lowering one in the cart lowered the
-- other. Now the card is the grupo, titled by its oldest row (the owner's
-- work lives there). Fiable's grupo already is brand + category + modelo, so
-- nothing changes there.
CREATE OR REPLACE FUNCTION public.tienda_catalogo(p_f jsonb, p_ids uuid[], p_limit integer, p_offset integer)
 RETURNS TABLE(modelo text, brand text, category text, imagen text, desde_cents integer, variantes jsonb, mas_vendida uuid, total bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY EXECUTE $q$
    WITH filtrados AS MATERIALIZED (
      SELECT m.grupo, p.id, p.sku, p.name, p.modelo, p.brand, p.category, p.calidad,
             p.price_cents, p.quantity, p.image_url, p.created_at,
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
    -- One card per grupo. Its title, brand and category come from the
    -- oldest row: in Ruli the rows of one SKU (one per inventory) can carry
    -- different names, and grouping by them listed the same piece twice.
    grupos AS (
      SELECT f.grupo,
             (array_agg(f.modelo   ORDER BY f.created_at, f.id))[1] AS modelo,
             (array_agg(f.brand    ORDER BY f.created_at, f.id))[1] AS brand,
             (array_agg(f.category ORDER BY f.created_at, f.id))[1] AS category,
             max((f.quantity > 0 OR f.es_dropship)::int) AS hay_stock,
             max((f.price_cents > 0)::int) AS hay_precio,
             min(f.price_cents) FILTER (WHERE f.price_cents > 0) AS desde,
             sum(f.ventas) AS ventas
        FROM filtrados f
       GROUP BY f.grupo
    ),
    pagina AS (
      SELECT g.*, count(*) OVER () AS total
        FROM grupos g
       ORDER BY g.hay_stock DESC,
                CASE WHEN $1 ->> 'orden' = 'vendidos' THEN g.ventas END DESC NULLS LAST,
                CASE WHEN $1 ->> 'orden' = 'precio_asc' THEN g.desde END ASC NULLS LAST,
                CASE WHEN $1 ->> 'orden' = 'precio_desc' THEN g.desde END DESC NULLS LAST,
                g.hay_precio DESC, g.modelo, g.brand, g.category
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
               'sku', f.sku,
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
$function$;
