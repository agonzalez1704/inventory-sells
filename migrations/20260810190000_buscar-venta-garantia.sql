-- Find the sale a warranty belongs to.
--
-- The customer walks in holding the part, not the folio. /ventas only filters
-- by date range, so the only way to reach the sale was to guess the day it
-- happened — which for a part that failed three months later is no way at all.
--
-- Searches the three things somebody at the counter actually has: the
-- customer's name, the part, or the folio off their ticket.
CREATE OR REPLACE FUNCTION public.buscar_ventas_garantia(
  p_q     text,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id            uuid,
  created_at    timestamptz,
  total_cents   int,
  customer_id   uuid,
  customer_name text,
  -- Mostrador sales are returned rather than hidden: the operator has to see
  -- that the sale exists and understand why it cannot carry a warranty yet,
  -- instead of searching for something that silently is not there.
  es_mostrador  boolean,
  piezas        bigint
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT s.id, s.created_at, s.total_cents, s.customer_id, s.customer_name,
         coalesce(c.is_system, true) AS es_mostrador,
         (SELECT count(*) FROM public.sale_items si WHERE si.sale_id = s.id) AS piezas
    FROM public.sales s
    LEFT JOIN public.customers c ON c.id = s.customer_id
   WHERE s.status = 'completed'
     AND (
       -- The folio as printed: the head of the uuid.
       s.id::text LIKE lower(btrim(p_q)) || '%'
       OR s.customer_name ILIKE '%' || btrim(p_q) || '%'
       -- The part itself, by name or code. `busqueda` is the same generated
       -- column the catalogue search uses, so a code found here is a code
       -- found there.
       OR EXISTS (
            SELECT 1
              FROM public.sale_items si
              JOIN public.products p ON p.id = si.product_id
             WHERE si.sale_id = s.id
               AND p.busqueda LIKE '%' || lower(btrim(p_q)) || '%'
          )
     )
   ORDER BY s.created_at DESC
   LIMIT greatest(1, least(coalesce(p_limit, 20), 50));
$$;

GRANT EXECUTE ON FUNCTION public.buscar_ventas_garantia(text, int) TO authenticated;
