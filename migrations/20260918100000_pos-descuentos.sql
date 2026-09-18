-- POS discounts.
--
-- 1. The customer's own descuento_pct now applies at the till (it only ever
--    applied to WhatsApp quotes). Same rounding convention as those:
--    unit = round(price_cents * (100 - pct) / 100.0), half-up per unit.
-- 2. An admin may override it for one sale with p_descuento_pct ("manual").
--    Checked here, not in the app: a seller's browser can send anything.
--
-- The discounted price is what lands in sale_items.unit_price_cents, so every
-- report, the corte and FIFO margins keep reading one number. The catalog
-- price is kept beside it (precio_lista_cents) and the sale says which
-- discount it got and why.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS descuento_pct numeric(5,2) NOT NULL DEFAULT 0
    CHECK (descuento_pct >= 0 AND descuento_pct <= 100),
  ADD COLUMN IF NOT EXISTS descuento_origen text
    CHECK (descuento_origen IN ('cliente', 'manual'));

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS precio_lista_cents int;

-- New trailing parameter: drop the old signatures first, or a call naming only
-- the old parameters would match both overloads and fail as ambiguous.
DROP FUNCTION IF EXISTS public.register_sale(jsonb, text, text, uuid, jsonb);
DROP FUNCTION IF EXISTS public.register_loan(jsonb, uuid, text);

-- Which discount a sale gets. Null pct = the customer's; a value = manual,
-- admin only. Mostrador never carries one of its own.
CREATE OR REPLACE FUNCTION public.descuento_de_venta(p_customer_id uuid, p_manual numeric)
RETURNS TABLE (pct numeric, origen text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_pct numeric;
BEGIN
  IF p_manual IS NOT NULL THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'solo un administrador puede dar descuento a mano' USING errcode = '42501';
    END IF;
    IF p_manual < 0 OR p_manual > 100 THEN
      RAISE EXCEPTION 'descuento inválido: %', p_manual USING errcode = '23514';
    END IF;
    RETURN QUERY SELECT p_manual, CASE WHEN p_manual > 0 THEN 'manual' END;
    RETURN;
  END IF;

  SELECT c.descuento_pct INTO v_pct
  FROM public.customers c
  WHERE c.id = p_customer_id AND NOT c.is_system;

  v_pct := coalesce(v_pct, 0);
  RETURN QUERY SELECT v_pct, CASE WHEN v_pct > 0 THEN 'cliente' END;
END;
$$;

REVOKE ALL ON FUNCTION public.descuento_de_venta(uuid, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.descuento_de_venta(uuid, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.register_sale(
  p_items          jsonb,
  p_payment_method text DEFAULT 'efectivo',
  p_customer_name  text DEFAULT NULL,
  p_customer_id    uuid DEFAULT NULL,
  p_pagos          jsonb DEFAULT NULL,
  p_descuento_pct  numeric DEFAULT NULL
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
  v_unit       int;
  v_line_total int;
  v_total      int := 0;
  v_cust_name  text := p_customer_name;
  v_npagos     int := 0;
  v_suma       int := 0;
  v_metodo     text := p_payment_method;
  v_costo      bigint;
  v_saldo_usa  int := 0;
  v_saldo_hay  int;
  v_sys        boolean;
  v_pct        numeric;
  v_origen     text;
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

  SELECT d.pct, d.origen INTO v_pct, v_origen FROM public.descuento_de_venta(p_customer_id, p_descuento_pct) d;

  INSERT INTO public.sales (payment_method, customer_name, customer_id, sold_by, total_cents, descuento_pct, descuento_origen)
  VALUES (v_metodo, v_cust_name, p_customer_id, v_uid, 0, v_pct, v_origen)
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

    v_unit := round(v_product.price_cents * (100 - v_pct) / 100.0)::int;
    v_line_total := v_unit * v_qty;
    v_total := v_total + v_line_total;

    -- FIFO: these specific pieces cost this much.
    v_costo := public.consumir_capas_fifo(v_product.id, v_qty);

    INSERT INTO public.sale_items
      (sale_id, product_id, qty, unit_price_cents, line_total_cents, costo_total_cents, precio_lista_cents)
    VALUES (v_sale_id, v_product.id, v_qty, v_unit, v_line_total, v_costo, v_product.price_cents);

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

  -- ---- Store credit ----
  -- Read from p_pagos regardless of how many entries there are: a sale paid
  -- entirely with credit arrives as a single payment, and that case writes no
  -- sale_pagos row, so the ledger movement below is the only record of it.
  IF p_pagos IS NOT NULL AND jsonb_typeof(p_pagos) = 'array' THEN
    SELECT coalesce(sum((x->>'monto_cents')::int), 0) INTO v_saldo_usa
      FROM jsonb_array_elements(p_pagos) x
     WHERE x->>'metodo' = 'saldo';
  END IF;

  IF v_saldo_usa > 0 THEN
    IF p_customer_id IS NULL THEN
      RAISE EXCEPTION 'para pagar con saldo hay que elegir al cliente';
    END IF;
    IF v_npagos = 1 AND v_saldo_usa <> v_total THEN
      RAISE EXCEPTION 'el saldo cubre % y la venta es de %', v_saldo_usa, v_total USING errcode = '23514';
    END IF;

    SELECT is_system INTO v_sys FROM public.customers WHERE id = p_customer_id FOR UPDATE;
    IF coalesce(v_sys, false) THEN
      RAISE EXCEPTION 'Mostrador no tiene saldo: elige al cliente registrado';
    END IF;

    v_saldo_hay := public.saldo_de_cliente(p_customer_id);
    IF v_saldo_usa > v_saldo_hay THEN
      RAISE EXCEPTION 'el saldo a favor es de % y se quieren usar %',
        v_saldo_hay, v_saldo_usa USING errcode = '23514';
    END IF;

    INSERT INTO public.saldo_movimientos
      (customer_id, monto_cents, origen, sale_id, motivo, created_by)
    VALUES (p_customer_id, -v_saldo_usa, 'venta', v_sale_id, 'Pago con saldo', v_uid);
  END IF;

  RETURN v_sale_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_loan(
  p_items         jsonb,
  p_customer_id   uuid DEFAULT NULL,
  p_note          text DEFAULT NULL,
  p_descuento_pct numeric DEFAULT NULL
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

  INSERT INTO public.sales (status, payment_method, note, customer_id, customer_name, sold_by, total_cents, descuento_pct, descuento_origen)
  VALUES ('pending', NULL, v_nota, v_cust.id, v_cust.nombre, v_uid, 0, v_pct, v_origen)
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

  -- The limit, against what they ALREADY owe plus this note.
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

REVOKE ALL ON FUNCTION public.register_sale(jsonb, text, text, uuid, jsonb, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.register_sale(jsonb, text, text, uuid, jsonb, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.register_loan(jsonb, uuid, text, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.register_loan(jsonb, uuid, text, numeric) TO authenticated;
