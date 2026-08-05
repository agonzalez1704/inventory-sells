-- Inventory header stats, aggregated in SQL.
--
-- /inventario computed units, value, low-stock and out-of-stock by reducing
-- over the full product array in the browser — which is only possible while the
-- browser holds the full catalog, the thing this batch of changes removes.
-- Four numbers do not justify shipping 21k rows.
CREATE OR REPLACE FUNCTION public.estadisticas_inventario(p_inventory_id uuid DEFAULT NULL)
RETURNS TABLE (productos bigint, piezas bigint, valor_cents bigint, bajos bigint, agotados bigint)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT count(*),
         coalesce(sum(quantity), 0),
         coalesce(sum(price_cents::bigint * quantity), 0),
         count(*) FILTER (WHERE quantity > 0 AND quantity <= 5),
         count(*) FILTER (WHERE quantity = 0)
  FROM public.products
  WHERE is_active
    AND (p_inventory_id IS NULL OR inventory_id = p_inventory_id);
$$;

GRANT EXECUTE ON FUNCTION public.estadisticas_inventario(uuid) TO authenticated;
