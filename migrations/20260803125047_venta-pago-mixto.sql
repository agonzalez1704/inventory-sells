-- Pago mixto: one sale settled with more than one method (part transfer, part
-- cash). Until now a sale carried exactly one payment_method, so a split had to
-- be recorded as a lie.
--
-- The pieces already existed: sale_pagos was built for fiado abonos and already
-- holds an amount + method per row. A split sale reuses it, and the sale itself
-- is marked 'mixto' so the corte knows its money comes from those rows instead
-- of from payment_method — which is what keeps the till from counting it twice.

ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;
ALTER TABLE public.sales
  ADD CONSTRAINT sales_payment_method_check
  CHECK (payment_method = ANY (ARRAY['efectivo','tarjeta','transferencia','otro','mixto']));

-- register_sale gains an optional p_pagos = [{metodo, monto_cents}].
--   NULL / one method  → unchanged behaviour: payment_method set, no sale_pagos.
--   two or more        → payment_method='mixto' + one sale_pagos row each.
-- The split MUST add up to the sale total: a mismatch here would silently
-- unbalance the till, so it raises instead.
CREATE OR REPLACE FUNCTION public.register_sale(
  p_items          jsonb,
  p_payment_method text DEFAULT 'efectivo',
  p_customer_name  text DEFAULT NULL,
  p_customer_id    uuid DEFAULT NULL,
  p_pagos          jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid        text := public.requesting_user_id();
  v_sale_id    uuid;
  v_item       jsonb;
  v_product    public.products%ROWTYPE;
  v_qty        int;
  v_line_total int;
  v_total      int := 0;
  v_cust_name  text := p_customer_name;
  v_npagos     int := 0;
  v_suma       int := 0;
  v_metodo     text := p_payment_method;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'no items';
  END IF;

  IF p_pagos IS NOT NULL AND jsonb_typeof(p_pagos) = 'array' THEN
    v_npagos := jsonb_array_length(p_pagos);
    SELECT coalesce(sum((x->>'monto_cents')::int), 0) INTO v_suma
      FROM jsonb_array_elements(p_pagos) x;
  END IF;

  IF v_npagos = 1 THEN
    -- A single "split" is just a normal sale; don't create ledger noise.
    SELECT (x->>'metodo') INTO v_metodo FROM jsonb_array_elements(p_pagos) x LIMIT 1;
  ELSIF v_npagos > 1 THEN
    v_metodo := 'mixto';
  END IF;

  IF p_customer_id IS NOT NULL THEN
    SELECT nombre INTO v_cust_name FROM public.customers WHERE id = p_customer_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'cliente no encontrado';
    END IF;
  END IF;

  INSERT INTO public.sales (payment_method, customer_name, customer_id, sold_by, total_cents)
  VALUES (v_metodo, v_cust_name, p_customer_id, v_uid, 0)
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'qty')::int;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'invalid qty for item %', v_item;
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::uuid
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'product % not found', v_item->>'product_id';
    END IF;
    IF v_product.quantity < v_qty THEN
      RAISE EXCEPTION 'insufficient stock for % (have %, need %)',
        v_product.sku, v_product.quantity, v_qty USING errcode = '23514';
    END IF;

    v_line_total := v_product.price_cents * v_qty;
    v_total := v_total + v_line_total;

    INSERT INTO public.sale_items (sale_id, product_id, qty, unit_price_cents, line_total_cents)
    VALUES (v_sale_id, v_product.id, v_qty, v_product.price_cents, v_line_total);

    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
    VALUES (v_product.id, -v_qty, 'sale', v_sale_id, v_uid);
  END LOOP;

  UPDATE public.sales SET total_cents = v_total WHERE id = v_sale_id;

  IF v_npagos > 1 THEN
    IF v_suma <> v_total THEN
      RAISE EXCEPTION 'los pagos suman % y la venta es de % — deben coincidir',
        v_suma, v_total USING errcode = '23514';
    END IF;
    INSERT INTO public.sale_pagos (sale_id, monto_cents, metodo, created_by)
    SELECT v_sale_id, (x->>'monto_cents')::int, (x->>'metodo'), v_uid
      FROM jsonb_array_elements(p_pagos) x;
  END IF;

  RETURN v_sale_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_sale(jsonb, text, text, uuid, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.register_sale(jsonb, text, text, uuid, jsonb) TO authenticated;

-- Drop the 4-arg version: with all-default parameters, keeping both makes a
-- 4-argument call ambiguous and Postgres refuses it — which would break every
-- existing sale rather than fall back gracefully.
DROP FUNCTION IF EXISTS public.register_sale(jsonb, text, text, uuid);
