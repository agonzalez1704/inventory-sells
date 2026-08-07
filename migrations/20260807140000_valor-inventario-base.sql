-- How the inventory header values the stock: at sale price or at cost.
--
-- Ruli reads the number as "what this stock cost me", Fiable as "what it is
-- worth on the shelf". Both are legitimate, so it is a setting rather than a
-- new hard-coded rule.
--
-- Nullable on purpose: NULL means "nobody has chosen", and the app falls back
-- to the brand's default (costo for Ruli, venta for Fiable). A NOT NULL column
-- would have to pick one default for both databases and then Ruli would ship
-- wrong until someone went in and flipped it.
ALTER TABLE public.config_negocio
  ADD COLUMN valor_base text CHECK (valor_base IN ('venta', 'costo'));

-- Column-level grant, like info and asesores: without it every save fails with
-- a permission error that never mentions the column.
GRANT UPDATE (valor_base) ON public.config_negocio TO authenticated;

-- Both valuations in one pass. The alternative — a boolean parameter — would
-- mean a round trip whenever the setting changes, for a sum over the same rows
-- the scan already touches.
DROP FUNCTION IF EXISTS public.estadisticas_inventario(uuid);

CREATE FUNCTION public.estadisticas_inventario(p_inventory_id uuid DEFAULT NULL)
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
         count(*) FILTER (WHERE quantity > 0 AND quantity <= 5),
         count(*) FILTER (WHERE quantity = 0)
  FROM public.products
  WHERE is_active
    AND (p_inventory_id IS NULL OR inventory_id = p_inventory_id);
$$;

GRANT EXECUTE ON FUNCTION public.estadisticas_inventario(uuid) TO authenticated;
