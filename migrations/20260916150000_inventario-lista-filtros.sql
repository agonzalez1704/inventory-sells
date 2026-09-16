-- /inventario redesign, part 1: the list and its filters (approved mockup,
-- https://claude.ai/artifact/3FdwMaztz7gYxaqsgBmJkt).
--
-- A reorder point per product. Null keeps today's behaviour — "bajo" meant five
-- pieces or fewer for everything — so nothing changes until someone sets one.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_minimo integer
  CHECK (stock_minimo IS NULL OR stock_minimo >= 0);

-- Header numbers: "bajo" now means under that product's own minimum.
CREATE OR REPLACE FUNCTION public.estadisticas_inventario(p_inventory_id uuid DEFAULT NULL)
RETURNS TABLE (
  productos bigint,
  piezas bigint,
  valor_venta_cents bigint,
  valor_costo_cents bigint,
  bajos bigint,
  agotados bigint
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT count(*),
         coalesce(sum(quantity), 0),
         coalesce(sum(price_cents::bigint * quantity), 0),
         coalesce(sum(cost_cents::bigint * quantity), 0),
         count(*) FILTER (WHERE quantity > 0 AND quantity <= coalesce(stock_minimo, 5)),
         count(*) FILTER (WHERE quantity <= 0)
  FROM public.products
  WHERE is_active
    AND (p_inventory_id IS NULL OR inventory_id = p_inventory_id);
$$;

-- Products per inventory, for the counts in the filter rail.
CREATE OR REPLACE FUNCTION public.inventario_conteos()
RETURNS TABLE (inventory_id uuid, productos bigint)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT inventory_id, count(*) FROM public.products WHERE is_active GROUP BY inventory_id;
$$;
GRANT EXECUTE ON FUNCTION public.inventario_conteos() TO authenticated;

-- One page of the list, filtered and sorted in SQL.
--
-- p_f keys (absent = no filter):
--   inv (uuid), cat (text), pmin / pmax (cents),
--   alerta: 'bajo' (under its minimum) | 'agotado',
--   orden: 'vendidos' (last 30 days) | 'stock_asc' | 'stock_desc'
--          | 'precio_asc' | 'precio_desc'; absent = name.
-- p_ids: a search's candidates (ranked in JS); null = browse.
--
-- plpgsql + EXECUTE … USING, so absent filters fold away at plan time (a
-- LANGUAGE sql body plans p_f as opaque — see insforge-funciones-rendimiento).
-- Sales of the last 30 days are summed for every product only when sorting by
-- them; otherwise just for the rows on the page. Runs as the caller: RLS on
-- products still applies.
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
    WITH base AS MATERIALIZED (
      SELECT p.id, p.inventory_id, p.sku, p.name, p.brand, p.size, p.category,
             p.price_cents, p.cost_cents, p.quantity, p.etiqueta, p.image_url,
             p.ventas_anuales, p.stock_minimo,
             CASE WHEN $1 ->> 'orden' = 'vendidos' THEN (
               SELECT coalesce(sum(si.qty), 0)
                 FROM public.sale_items si
                 JOIN public.sales s ON s.id = si.sale_id
                  AND s.status = 'completed'
                  AND s.created_at >= now() - interval '30 days'
                WHERE si.product_id = p.id)
             END AS v30
        FROM public.products p
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
           o.ventas_anuales, o.stock_minimo,
           coalesce(o.v30, (
             SELECT coalesce(sum(si.qty), 0)
               FROM public.sale_items si
               JOIN public.sales s ON s.id = si.sale_id
                AND s.status = 'completed'
                AND s.created_at >= now() - interval '30 days'
              WHERE si.product_id = o.id))::bigint,
           o.total
      FROM ordenado o
     WHERE o.rn > greatest(0, coalesce($4, 0))
       AND o.rn <= greatest(0, coalesce($4, 0)) + greatest(1, least(coalesce($3, 50), 1000))
     ORDER BY o.rn
  $q$ USING p_f, p_ids, p_limit, p_offset;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.inventario_lista(jsonb, uuid[], integer, integer) TO authenticated;
