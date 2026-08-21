-- A product born inside a purchase learns its cost from that purchase.
--
-- Products can now be created during capture (a part the shop has never
-- stocked), and they start at cost 0 because the purchase line is the cost.
-- But confirmar_compra only wrote the FIFO layer — products.cost_cents stayed
-- untouched, so the newborn kept cost 0 forever, poisoning every reader of
-- that column: the POS cost display, the inventory valuation, the requisition
-- estimate.
--
-- Only cost 0 is filled, and only from a real cost. A product that already has
-- a cost keeps it: "latest purchase overwrites cost" would be a policy change
-- for every established product, and that is not what this migration is for.
-- The OUT-parameter names differ from the deployed version, and CREATE OR
-- REPLACE refuses any return-type change — the same trap this repo has now hit
-- four times. DROP first.
DROP FUNCTION IF EXISTS public.confirmar_compra(uuid);
CREATE FUNCTION public.confirmar_compra(p_id uuid)
RETURNS TABLE (piezas int, total bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_estado text;
  v_uid    text := coalesce(public.requesting_user_id(), 'sistema');
  v_piezas int;
  v_total  bigint;
BEGIN
  SELECT estado INTO v_estado FROM public.compras WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'compra no encontrada'; END IF;
  IF v_estado <> 'borrador' THEN
    RAISE EXCEPTION 'la compra ya fue % — solo un borrador se puede recibir', v_estado;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.compra_items WHERE compra_id = p_id) THEN
    RAISE EXCEPTION 'la compra no tiene productos';
  END IF;

  INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
  SELECT ci.product_id, ci.qty, 'purchase', p_id, v_uid
    FROM public.compra_items ci WHERE ci.compra_id = p_id;

  -- One cost layer per line: this is what makes FIFO possible downstream.
  INSERT INTO public.costo_capas
    (product_id, compra_id, qty_inicial, qty_restante, costo_unitario_cents)
  SELECT ci.product_id, p_id, ci.qty, ci.qty, ci.costo_unitario_cents
    FROM public.compra_items ci WHERE ci.compra_id = p_id;

  -- A costless product takes its first purchase's cost. Established costs are
  -- never overwritten here.
  UPDATE public.products p
     SET cost_cents = ci.costo_unitario_cents
    FROM public.compra_items ci
   WHERE ci.compra_id = p_id
     AND ci.product_id = p.id
     AND p.cost_cents = 0
     AND ci.costo_unitario_cents > 0;

  SELECT coalesce(sum(qty), 0), coalesce(sum(line_total_cents), 0)
    INTO v_piezas, v_total
    FROM public.compra_items WHERE compra_id = p_id;

  UPDATE public.compras SET estado = 'recibida', recibida_at = now() WHERE id = p_id;
  RETURN QUERY SELECT v_piezas, v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_compra(uuid) TO authenticated;
