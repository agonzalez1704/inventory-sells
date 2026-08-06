-- A credit note has to be owed by somebody.
--
-- register_loan only ever took a free-text note, so the debtor was a string
-- typed into a box: "Ernesto · Local 87". Nothing linked it to the customer
-- registry, so there was no way to see everything one person owes, no phone to
-- call, and the per-customer discount never applied. Of the loans on file, one
-- in seven has a customer id and all of them have a note — the note WAS the
-- customer.
--
-- The requirement is enforced here rather than only in the register, because the
-- POS is not the only caller that could ever create one, and a debt owed by
-- nobody is not a state worth allowing.
--
-- The 2-argument version is dropped rather than left beside the new one: with
-- p_note defaulted, keeping both would make a 2-argument call ambiguous and
-- Postgres refuses it — which would break every loan instead of falling back.
DROP FUNCTION IF EXISTS public.register_loan(jsonb, text);

CREATE OR REPLACE FUNCTION public.register_loan(
  p_items       jsonb,
  p_customer_id uuid,
  p_note        text DEFAULT NULL
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
  v_cust       public.customers%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'no items';
  END IF;

  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'un crédito necesita cliente: elige a quién se le fía'
      USING errcode = '23514';
  END IF;
  SELECT * INTO v_cust FROM public.customers WHERE id = p_customer_id;
  IF NOT FOUND OR NOT v_cust.is_active THEN
    RAISE EXCEPTION 'cliente no encontrado o inactivo' USING errcode = '23514';
  END IF;
  -- "Mostrador" is the walk-in placeholder, not a person. Fiar to it would
  -- recreate exactly the anonymous debt this change removes.
  IF v_cust.is_system THEN
    RAISE EXCEPTION 'no se puede fiar a Mostrador: registra al cliente'
      USING errcode = '23514';
  END IF;

  INSERT INTO public.sales (status, payment_method, note, customer_id, customer_name, sold_by, total_cents)
  VALUES ('pending', NULL, p_note, p_customer_id, v_cust.nombre, v_uid, 0)
  RETURNING id INTO v_sale_id;

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

REVOKE EXECUTE ON FUNCTION public.register_loan(jsonb, uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.register_loan(jsonb, uuid, text) TO authenticated;
