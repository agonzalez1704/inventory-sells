-- Swap the product(s) on a PENDING loan (fiado): restore the current items to
-- stock, then take the new ones — atomically, rejecting oversell. Recomputes
-- the loan total at current prices.
CREATE OR REPLACE FUNCTION public.editar_fiado(
  p_sale_id uuid,
  p_items   jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid     text := public.requesting_user_id();
  v_status  text;
  v_old     record;
  v_item    jsonb;
  v_product public.products%ROWTYPE;
  v_qty     int;
  v_line    int;
  v_total   int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'no items';
  END IF;

  SELECT status INTO v_status FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fiado no encontrado';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'solo fiados pendientes (status %)', v_status;
  END IF;

  -- 1. Restore stock for the current items (the ledger trigger updates quantity).
  FOR v_old IN SELECT product_id, qty FROM public.sale_items WHERE sale_id = p_sale_id
  LOOP
    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
    VALUES (v_old.product_id, v_old.qty, 'return', p_sale_id, v_uid);
  END LOOP;
  DELETE FROM public.sale_items WHERE sale_id = p_sale_id;

  -- 2. Take the new items (stock now reflects the restored quantities).
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'qty')::int;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'invalid qty for item %', v_item;
    END IF;

    SELECT * INTO v_product FROM public.products
    WHERE id = (v_item->>'product_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'product % not found', v_item->>'product_id';
    END IF;
    IF v_product.quantity < v_qty THEN
      RAISE EXCEPTION 'insufficient stock for % (have %, need %)',
        v_product.sku, v_product.quantity, v_qty USING errcode = '23514';
    END IF;

    v_line := v_product.price_cents * v_qty;
    v_total := v_total + v_line;

    INSERT INTO public.sale_items (sale_id, product_id, qty, unit_price_cents, line_total_cents)
    VALUES (p_sale_id, v_product.id, v_qty, v_product.price_cents, v_line);

    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
    VALUES (v_product.id, -v_qty, 'sale', p_sale_id, v_uid);
  END LOOP;

  UPDATE public.sales SET total_cents = v_total WHERE id = p_sale_id;
  RETURN p_sale_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.editar_fiado(uuid, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.editar_fiado(uuid, jsonb) TO authenticated;
