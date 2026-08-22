-- Add a forgotten line to a purchase that was already received.
--
-- A draft is fully editable and stays that way. A received purchase is locked
-- because its lines already entered the inventory as FIFO layers that sales
-- may have partially consumed — removing or resizing those lines would rewrite
-- history the money already followed. But the reported case is additive: "I
-- forgot to capture two products." An added line can do exactly what receiving
-- did for the others — movement, layer, first-cost — atomically, without
-- touching anything that came before.
CREATE OR REPLACE FUNCTION public.agregar_item_compra_recibida(
  p_compra_id  uuid,
  p_product_id uuid,
  p_qty        integer,
  p_costo_cents integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid    text := coalesce(public.requesting_user_id(), 'sistema');
  v_estado text;
BEGIN
  SELECT estado INTO v_estado FROM public.compras WHERE id = p_compra_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'compra no encontrada'; END IF;
  IF v_estado <> 'recibida' THEN
    RAISE EXCEPTION 'esta función es para compras recibidas; un borrador se edita directo';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION 'cantidad inválida'; END IF;
  IF p_costo_cents IS NULL OR p_costo_cents < 0 THEN RAISE EXCEPTION 'costo inválido'; END IF;

  -- The same part twice on one received purchase is almost always the same
  -- forgotten line captured twice. The existing line cannot be merged (its
  -- layer may be consumed), so refuse and let a human decide.
  IF EXISTS (
    SELECT 1 FROM public.compra_items
    WHERE compra_id = p_compra_id AND product_id = p_product_id
  ) THEN
    RAISE EXCEPTION 'esa pieza ya está en la compra; si llegó de más, ajusta existencias desde Inventario';
  END IF;

  INSERT INTO public.compra_items (compra_id, product_id, qty, costo_unitario_cents)
  VALUES (p_compra_id, p_product_id, p_qty, p_costo_cents);

  INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
  VALUES (p_product_id, p_qty, 'purchase', p_compra_id, v_uid);

  INSERT INTO public.costo_capas
    (product_id, compra_id, qty_inicial, qty_restante, costo_unitario_cents)
  VALUES (p_product_id, p_compra_id, p_qty, p_qty, p_costo_cents);

  -- Mirror of receiving: a costless product learns its first cost here too.
  UPDATE public.products
     SET cost_cents = p_costo_cents
   WHERE id = p_product_id AND cost_cents = 0 AND p_costo_cents > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.agregar_item_compra_recibida(uuid, uuid, integer, integer) TO authenticated;
