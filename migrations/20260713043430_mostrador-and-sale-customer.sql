-- Default walk-in customer "Mostrador" + attach a customer to each sale.
-- Counter sales with no specific customer are attributed to Mostrador, a system
-- row that can't be archived/edited from the UI.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

-- Seed Mostrador with a fixed id so the app can default to it. Generic phone
-- (10 zeros) satisfies the required/unique-phone rule without colliding with
-- real numbers.
INSERT INTO public.customers (id, nombre, telefono, tipo, descuento_pct, is_system, created_by)
VALUES ('00000000-0000-0000-0000-000000000001', 'Mostrador', '0000000000', 'publico', 0, true, 'system')
ON CONFLICT (id) DO NOTHING;

-- register_sale gains p_customer_id. Drop the old 3-arg overload so PostgREST
-- has a single unambiguous signature. When a customer is given, their name is
-- copied into customer_name so existing displays/tickets keep working from one
-- source of truth.
DROP FUNCTION IF EXISTS public.register_sale(jsonb, text, text);

CREATE OR REPLACE FUNCTION public.register_sale(
  p_items          jsonb,
  p_payment_method text DEFAULT 'efectivo',
  p_customer_name  text DEFAULT NULL,
  p_customer_id    uuid DEFAULT NULL
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'no items';
  END IF;

  IF p_customer_id IS NOT NULL THEN
    SELECT nombre INTO v_cust_name FROM public.customers WHERE id = p_customer_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'cliente no encontrado';
    END IF;
  END IF;

  INSERT INTO public.sales (payment_method, customer_name, customer_id, sold_by, total_cents)
  VALUES (p_payment_method, v_cust_name, p_customer_id, v_uid, 0)
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
  RETURN v_sale_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_sale(jsonb, text, text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.register_sale(jsonb, text, text, uuid) TO authenticated;
