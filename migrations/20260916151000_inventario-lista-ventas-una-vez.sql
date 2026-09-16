-- inventario_lista: sum the last 30 days of sales once, not once per product.
--
-- The first version ran a correlated subquery per product when sorting by
-- sales: Ruli (21k products) took 939 ms for "Más vendidos". The sales of a
-- month are a few hundred lines — aggregate them once, hash-join, done. The
-- page rows read the same aggregate, so the second per-row subquery goes too.
-- Same signature and output.

CREATE OR REPLACE FUNCTION public.inventario_lista(
  p_f      jsonb,
  p_ids    uuid[],
  p_limit  integer,
  p_offset integer
)
RETURNS TABLE (
  id uuid, inventory_id uuid, sku text, name text, brand text, size text, category text,
  price_cents integer, cost_cents integer, quantity integer, etiqueta text, image_url text,
  ventas_anuales integer, stock_minimo integer, ventas_30d bigint, total bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $fn$
BEGIN
  RETURN QUERY EXECUTE $q$
    WITH ventas AS (
      SELECT si.product_id, sum(si.qty)::bigint AS piezas
        FROM public.sale_items si
        JOIN public.sales s ON s.id = si.sale_id
         AND s.status = 'completed'
         AND s.created_at >= now() - interval '30 days'
       GROUP BY si.product_id
    ),
    base AS MATERIALIZED (
      SELECT p.id, p.inventory_id, p.sku, p.name, p.brand, p.size, p.category,
             p.price_cents, p.cost_cents, p.quantity, p.etiqueta, p.image_url,
             p.ventas_anuales, p.stock_minimo, coalesce(v.piezas, 0) AS v30
        FROM public.products p
        LEFT JOIN ventas v ON v.product_id = p.id
       WHERE p.is_active
         AND ($2 IS NULL OR p.id = ANY ($2))
         AND (NOT ($1 ? 'inv')  OR p.inventory_id = ($1 ->> 'inv')::uuid)
         AND (NOT ($1 ? 'cat')  OR p.category = $1 ->> 'cat')
         AND (NOT ($1 ? 'pmin') OR p.price_cents >= ($1 ->> 'pmin')::integer)
         AND (NOT ($1 ? 'pmax') OR p.price_cents <= ($1 ->> 'pmax')::integer)
         AND (NOT ($1 ? 'alerta')
              OR ($1 ->> 'alerta' = 'agotado' AND p.quantity <= 0)
              OR ($1 ->> 'alerta' = 'bajo' AND p.quantity > 0
                  AND p.quantity <= coalesce(p.stock_minimo, 5)))
    ),
    ordenado AS (
      SELECT b.*,
             row_number() OVER (ORDER BY
               CASE WHEN $1 ->> 'orden' = 'vendidos'    THEN b.v30 END DESC NULLS LAST,
               CASE WHEN $1 ->> 'orden' = 'stock_asc'   THEN b.quantity END ASC,
               CASE WHEN $1 ->> 'orden' = 'stock_desc'  THEN b.quantity END DESC,
               CASE WHEN $1 ->> 'orden' = 'precio_asc'  THEN b.price_cents END ASC,
               CASE WHEN $1 ->> 'orden' = 'precio_desc' THEN b.price_cents END DESC,
               b.name, b.id) AS rn,
             count(*) OVER () AS total
        FROM base b
    )
    SELECT o.id, o.inventory_id, o.sku, o.name, o.brand, o.size, o.category,
           o.price_cents, o.cost_cents, o.quantity, o.etiqueta, o.image_url,
           o.ventas_anuales, o.stock_minimo, o.v30, o.total
      FROM ordenado o
     WHERE o.rn > greatest(0, coalesce($4, 0))
       AND o.rn <= greatest(0, coalesce($4, 0)) + greatest(1, least(coalesce($3, 50), 1000))
     ORDER BY o.rn
  $q$ USING p_f, p_ids, p_limit, p_offset;
END;
$fn$;
