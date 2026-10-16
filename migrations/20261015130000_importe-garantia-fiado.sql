-- "Importe": a customer takes a part on credit and leaves cash as guarantee,
-- at least the part's price. The cash sits in the drawer but is not income
-- until the note is settled: then it pays the note and the rest goes back.
-- If the part comes back, the whole importe goes back.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS importe_cents        int CHECK (importe_cents IS NULL OR importe_cents > 0),
  ADD COLUMN IF NOT EXISTS importe_devuelto_at  timestamptz,
  ADD COLUMN IF NOT EXISTS importe_devuelto_por text;

CREATE INDEX IF NOT EXISTS sales_importe_idx ON public.sales (created_at) WHERE importe_cents IS NOT NULL;

-- register_loan grows a parameter: the importe held. Signature changes → DROP.
DROP FUNCTION IF EXISTS public.register_loan(jsonb, uuid, text, numeric);

CREATE FUNCTION public.register_loan(
  p_items         jsonb,
  p_customer_id   uuid DEFAULT NULL,
  p_note          text DEFAULT NULL,
  p_descuento_pct numeric DEFAULT NULL,
  p_importe_cents int DEFAULT NULL
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
  v_unit         int;
  v_line_total   int;
  v_total        int := 0;
  v_cust         public.customers%ROWTYPE;
  v_exige        boolean;
  v_nota         text := NULLIF(btrim(p_note), '');
  v_deuda        bigint;
  v_pct          numeric;
  v_origen       text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'no items';
  END IF;
  IF p_importe_cents IS NOT NULL AND p_importe_cents <= 0 THEN
    RAISE EXCEPTION 'importe inválido' USING errcode = '23514';
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

  SELECT d.pct, d.origen INTO v_pct, v_origen FROM public.descuento_de_venta(v_cust.id, p_descuento_pct) d;

  INSERT INTO public.sales (status, payment_method, note, customer_id, customer_name, sold_by, total_cents, descuento_pct, descuento_origen, importe_cents)
  VALUES ('pending', NULL, v_nota, v_cust.id, v_cust.nombre, v_uid, 0, v_pct, v_origen, p_importe_cents)
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

    v_unit := round(v_product.price_cents * (100 - v_pct) / 100.0)::int;
    v_line_total := v_unit * v_qty;
    v_total := v_total + v_line_total;

    INSERT INTO public.sale_items (sale_id, product_id, qty, unit_price_cents, line_total_cents, precio_lista_cents)
    VALUES (v_sale_id, v_product.id, v_qty, v_unit, v_line_total, v_product.price_cents);

    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
    VALUES (v_product.id, -v_qty, 'sale', v_sale_id, v_uid);
  END LOOP;

  -- The guarantee covers the note; a smaller one is just a partial payment
  -- and belongs in abonos.
  IF p_importe_cents IS NOT NULL AND p_importe_cents < v_total THEN
    RAISE EXCEPTION 'el importe ($%) debe cubrir la nota ($%)',
      round(p_importe_cents / 100.0, 2), round(v_total / 100.0, 2) USING errcode = '23514';
  END IF;

  -- The limit, against what they ALREADY owe plus this note. A note covered
  -- by an importe is no risk to the limit.
  IF v_cust.credito_limite_cents IS NOT NULL AND p_importe_cents IS NULL THEN
    SELECT coalesce(sum(
      s.total_cents - coalesce((
        SELECT sum(sp.monto_cents) FROM public.sale_pagos sp WHERE sp.sale_id = s.id
      ), 0)
    ), 0) INTO v_deuda
    FROM public.sales s
    WHERE s.customer_id = v_cust.id AND s.status = 'pending' AND s.id <> v_sale_id
      AND s.importe_cents IS NULL;

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
REVOKE EXECUTE ON FUNCTION public.register_loan(jsonb, uuid, text, numeric, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.register_loan(jsonb, uuid, text, numeric, int) TO authenticated;

-- The customer keeps the part: the importe pays what is owed, the rest is
-- handed back. Returns the change, in cents.
CREATE OR REPLACE FUNCTION public.aplicar_importe(p_sale_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid     text := public.requesting_user_id();
  v_sale    public.sales%ROWTYPE;
  v_pagado  int;
  v_falta   int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING errcode = '28000'; END IF;

  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'nota no encontrada'; END IF;
  IF v_sale.status <> 'pending' THEN RAISE EXCEPTION 'la nota no está pendiente (%)', v_sale.status; END IF;
  IF v_sale.importe_cents IS NULL THEN RAISE EXCEPTION 'esta nota no tiene importe'; END IF;
  IF v_sale.importe_devuelto_at IS NOT NULL THEN RAISE EXCEPTION 'el importe ya se devolvió'; END IF;

  v_pagado := public.fiado_pagado(p_sale_id);
  v_falta  := v_sale.total_cents - v_pagado;
  IF v_falta <= 0 THEN RAISE EXCEPTION 'la nota ya está pagada'; END IF;
  IF v_sale.importe_cents < v_falta THEN
    RAISE EXCEPTION 'el importe ($%) no cubre lo que falta ($%)',
      round(v_sale.importe_cents / 100.0, 2), round(v_falta / 100.0, 2);
  END IF;

  -- What is owed, paid in cash out of the importe; the importe itself goes
  -- back (the cuadre nets both: only the change physically leaves).
  INSERT INTO public.sale_pagos (sale_id, monto_cents, metodo, created_by)
  VALUES (p_sale_id, v_falta, 'efectivo', v_uid);

  UPDATE public.sales
  SET status = 'completed', payment_method = 'efectivo', settled_at = now(),
      importe_devuelto_at = now(), importe_devuelto_por = v_uid
  WHERE id = p_sale_id;

  RETURN v_sale.importe_cents - v_falta;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.aplicar_importe(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.aplicar_importe(uuid) TO authenticated;

-- Cancelling a note with an importe hands the importe back too.
CREATE OR REPLACE FUNCTION public.cancel_loan(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid    text := public.requesting_user_id();
  v_status text;
  v_item   record;
  v_pay    record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;

  SELECT status INTO v_status FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'loan not found';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'loan is not pending (status %)', v_status;
  END IF;

  FOR v_item IN SELECT product_id, qty FROM public.sale_items WHERE sale_id = p_sale_id
  LOOP
    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
    VALUES (v_item.product_id, v_item.qty, 'return', p_sale_id, v_uid);
  END LOOP;

  FOR v_pay IN
    SELECT metodo, SUM(monto_cents) AS total
    FROM public.sale_pagos WHERE sale_id = p_sale_id
    GROUP BY metodo
  LOOP
    INSERT INTO public.devoluciones (sale_id, monto_cents, metodo, motivo, created_by)
    VALUES (p_sale_id, v_pay.total, v_pay.metodo, 'Cancelación de fiado', v_uid);
  END LOOP;

  UPDATE public.sales
  SET status = 'void',
      importe_devuelto_at  = CASE WHEN importe_cents IS NOT NULL AND importe_devuelto_at IS NULL THEN now() ELSE importe_devuelto_at END,
      importe_devuelto_por = CASE WHEN importe_cents IS NOT NULL AND importe_devuelto_at IS NULL THEN v_uid ELSE importe_devuelto_por END
  WHERE id = p_sale_id;
END;
$$;
