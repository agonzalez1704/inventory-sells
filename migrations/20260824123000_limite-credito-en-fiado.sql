-- Enforce the customer's credit limit where the debt is born.
--
-- The check runs at the END of register_loan, once the note's real total is
-- known (prices come from the catalog during the loop). RAISE rolls the whole
-- transaction back — items, movements, everything — so a refused note leaves
-- no trace. In the database and not the UI, because the register is not
-- guaranteed to stay the only caller, and a credit limit that the client can
-- skip is a suggestion.
CREATE OR REPLACE FUNCTION public.register_loan(
  p_items       jsonb,
  p_customer_id uuid DEFAULT NULL,
  p_note        text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid          text := public.requesting_user_id();
  v_sale_id      uuid;
  v_item         jsonb;
  v_product      public.products%ROWTYPE;
  v_qty          int;
  v_line_total   int;
  v_total        int := 0;
  v_cust         public.customers%ROWTYPE;
  v_exige        boolean;
  v_nota         text := NULLIF(btrim(p_note), '');
  v_deuda        bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'no items';
  END IF;

  SELECT coalesce(fiado_exige_cliente, true) INTO v_exige
  FROM public.config_negocio WHERE id = 1;
  v_exige := coalesce(v_exige, true);

  IF p_customer_id IS NULL THEN
    IF v_exige THEN
      RAISE EXCEPTION 'un crédito necesita cliente: elige a quién se le fía'
        USING errcode = '23514';
    END IF;
    SELECT * INTO v_cust FROM public.customers WHERE is_system ORDER BY created_at LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'no existe el cliente Mostrador' USING errcode = '23514';
    END IF;
  ELSE
    SELECT * INTO v_cust FROM public.customers WHERE id = p_customer_id;
    IF NOT FOUND OR NOT v_cust.is_active THEN
      RAISE EXCEPTION 'cliente no encontrado o inactivo' USING errcode = '23514';
    END IF;
  END IF;

  IF v_cust.is_system THEN
    IF v_exige THEN
      RAISE EXCEPTION 'no se puede fiar a Mostrador: registra al cliente'
        USING errcode = '23514';
    END IF;
    IF v_nota IS NULL OR length(v_nota) < 5 THEN
      RAISE EXCEPTION 'fiado a Mostrador: escribe en la nota quién debe (nombre, teléfono o seña)'
        USING errcode = '23514';
    END IF;
  END IF;

  INSERT INTO public.sales (status, payment_method, note, customer_id, customer_name, sold_by, total_cents)
  VALUES ('pending', NULL, v_nota, v_cust.id, v_cust.nombre, v_uid, 0)
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

  -- The limit, against what they ALREADY owe plus this note. The new note is
  -- excluded from the debt sum (it has no pagos yet but is already pending).
  IF v_cust.credito_limite_cents IS NOT NULL THEN
    SELECT coalesce(sum(
      s.total_cents - coalesce((
        SELECT sum(sp.monto_cents) FROM public.sale_pagos sp WHERE sp.sale_id = s.id
      ), 0)
    ), 0) INTO v_deuda
    FROM public.sales s
    WHERE s.customer_id = v_cust.id AND s.status = 'pending' AND s.id <> v_sale_id;

    IF v_deuda + v_total > v_cust.credito_limite_cents THEN
      RAISE EXCEPTION 'excede su límite de crédito: debe $% y esta nota son $% (límite $%)',
        round(v_deuda / 100.0, 2), round(v_total / 100.0, 2),
        round(v_cust.credito_limite_cents / 100.0, 2)
        USING errcode = '23514';
    END IF;
  END IF;

  UPDATE public.sales SET total_cents = v_total WHERE id = v_sale_id;
  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_loan(jsonb, uuid, text) TO authenticated;
