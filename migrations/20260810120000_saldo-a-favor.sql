-- Store credit for a customer, as a ledger.
--
-- Today a warranty return that the customer wants to keep as credit is faked
-- with an "adelanto": a fixed amount tied to a made-up line item, with nothing
-- linking it to the return it came from or to the sale that eventually spends
-- it. No report can answer "what do we owe this customer" or "where did that
-- credit go".
--
-- A ledger of signed movements rather than a balance column on customers: a
-- stored balance drifts the first time two tills touch it at once, and when it
-- disagrees with reality there is nothing to reconstruct it from. The balance
-- is the sum, always.
CREATE TABLE public.saldo_movimientos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid NOT NULL REFERENCES public.customers(id),
  -- Positive credits the customer, negative spends. Never zero.
  monto_cents   int  NOT NULL CHECK (monto_cents <> 0),
  origen        text NOT NULL CHECK (origen IN ('devolucion', 'venta')),
  devolucion_id uuid REFERENCES public.devoluciones(id),
  sale_id       uuid REFERENCES public.sales(id),
  motivo        text,
  created_by    text NOT NULL DEFAULT public.requesting_user_id(),
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- The rule the shop asked for, written where it cannot be worked around:
  -- credit is never conjured. Every peso added has to name the return it came
  -- out of, and every peso spent has to name the sale that spent it. There is
  -- no "give this customer $500" — not in the UI, and not for anyone who
  -- reaches the table directly.
  CONSTRAINT saldo_con_origen CHECK (
    (monto_cents > 0 AND origen = 'devolucion' AND devolucion_id IS NOT NULL)
    OR
    (monto_cents < 0 AND origen = 'venta' AND sale_id IS NOT NULL)
  )
);

CREATE INDEX saldo_movimientos_cliente_idx ON public.saldo_movimientos (customer_id, created_at DESC);

ALTER TABLE public.saldo_movimientos ENABLE ROW LEVEL SECURITY;

-- Readable by staff; writable by nobody. Both writes happen inside SECURITY
-- DEFINER functions, next to the event that justifies them, so a movement
-- cannot exist without its return or its sale.
CREATE POLICY "authenticated read saldo_movimientos"
  ON public.saldo_movimientos FOR SELECT TO authenticated
  USING (public.requesting_user_id() IS NOT NULL);

GRANT SELECT ON public.saldo_movimientos TO authenticated;

CREATE OR REPLACE FUNCTION public.saldo_de_cliente(p_customer_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT coalesce(sum(monto_cents), 0)::int
    FROM public.saldo_movimientos
   WHERE customer_id = p_customer_id;
$$;

GRANT EXECUTE ON FUNCTION public.saldo_de_cliente(uuid) TO authenticated;

-- ---- 'saldo' becomes a payment method ----
--
-- It is not income. The money came in on the day of the original sale; this is
-- the shop settling a debt it already owes. The cash count keeps it in its own
-- column for exactly that reason.
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_payment_method_check
  CHECK (payment_method IN ('efectivo', 'tarjeta', 'transferencia', 'otro', 'mixto', 'saldo'));

ALTER TABLE public.sale_pagos DROP CONSTRAINT IF EXISTS sale_pagos_metodo_check;
ALTER TABLE public.sale_pagos ADD CONSTRAINT sale_pagos_metodo_check
  CHECK (metodo IN ('efectivo', 'tarjeta', 'transferencia', 'otro', 'saldo'));

ALTER TABLE public.devoluciones DROP CONSTRAINT IF EXISTS devoluciones_metodo_check;
ALTER TABLE public.devoluciones ADD CONSTRAINT devoluciones_metodo_check
  CHECK (metodo IN ('efectivo', 'tarjeta', 'transferencia', 'otro', 'saldo'));

-- ---- Credit is created here, and only here ----
--
-- Same function as before with one branch added: when the refund method is
-- 'saldo', no money moves and the amount is written to the customer's ledger
-- instead, pointing back at this very return.
--
-- It demands a real customer. "Mostrador" is the walk-in placeholder every
-- anonymous sale is attributed to — crediting it would pool every customer's
-- credit into one bucket that anybody could then spend.
CREATE OR REPLACE FUNCTION public.devolver_items(
  p_sale_id uuid,
  p_items   jsonb,
  p_metodo  text,
  p_motivo  text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid    text := public.requesting_user_id();
  v_status text;
  v_item   jsonb;
  v_pid    uuid;
  v_qty    int;
  v_sold   int;
  v_unit   int;
  v_prev   int;
  v_total  int := 0;
  v_devid  uuid;
  v_cust   uuid;
  v_sys    boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'solo administradores pueden hacer devoluciones' USING errcode = '42501';
  END IF;
  IF p_metodo IS NULL OR p_metodo NOT IN ('efectivo','tarjeta','transferencia','otro','saldo') THEN
    RAISE EXCEPTION 'método inválido: %', p_metodo;
  END IF;

  SELECT status, customer_id INTO v_status, v_cust
  FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'venta no encontrada';
  END IF;
  IF v_status <> 'completed' THEN
    RAISE EXCEPTION 'solo se devuelven ventas cerradas (status %)', v_status;
  END IF;

  IF p_metodo = 'saldo' THEN
    IF v_cust IS NULL THEN
      RAISE EXCEPTION 'para dejar saldo a favor la venta necesita un cliente registrado';
    END IF;
    SELECT is_system INTO v_sys FROM public.customers WHERE id = v_cust;
    IF coalesce(v_sys, false) THEN
      RAISE EXCEPTION 'Mostrador no puede tener saldo a favor: registra al cliente en la venta';
    END IF;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'qty')::int;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'cantidad inválida';
    END IF;

    SELECT qty, unit_price_cents INTO v_sold, v_unit
    FROM public.sale_items WHERE sale_id = p_sale_id AND product_id = v_pid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ese producto no está en la venta';
    END IF;

    SELECT COALESCE(SUM(di.qty), 0) INTO v_prev
    FROM public.devolucion_items di
    JOIN public.devoluciones d ON d.id = di.devolucion_id
    WHERE d.sale_id = p_sale_id AND di.product_id = v_pid;

    IF v_qty > v_sold - v_prev THEN
      RAISE EXCEPTION 'la devolución excede lo vendido (vendido %, ya devuelto %)', v_sold, v_prev;
    END IF;

    v_total := v_total + v_unit * v_qty;
  END LOOP;

  INSERT INTO public.devoluciones (sale_id, monto_cents, metodo, motivo, created_by)
  VALUES (p_sale_id, v_total, p_metodo, NULLIF(btrim(p_motivo), ''), v_uid)
  RETURNING id INTO v_devid;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'qty')::int;
    SELECT unit_price_cents INTO v_unit
    FROM public.sale_items WHERE sale_id = p_sale_id AND product_id = v_pid;

    INSERT INTO public.devolucion_items (devolucion_id, product_id, qty, unit_price_cents)
    VALUES (v_devid, v_pid, v_qty, v_unit);

    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
    VALUES (v_pid, v_qty, 'return', p_sale_id, v_uid);
  END LOOP;

  IF p_metodo = 'saldo' THEN
    INSERT INTO public.saldo_movimientos
      (customer_id, monto_cents, origen, devolucion_id, motivo, created_by)
    VALUES (v_cust, v_total, 'devolucion', v_devid,
            coalesce(NULLIF(btrim(p_motivo), ''), 'Devolución'), v_uid);
  END IF;

  RETURN v_devid;
END;
$$;

-- ---- Credit is spent here, atomically with the sale ----
--
-- Inside register_sale rather than in a second call afterwards: a sale that
-- committed while the deduction failed would hand the goods over and leave the
-- credit intact.
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
  v_costo      bigint;
  v_saldo_usa  int := 0;
  v_saldo_hay  int;
  v_sys        boolean;
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

    -- FIFO: these specific pieces cost this much.
    v_costo := public.consumir_capas_fifo(v_product.id, v_qty);

    INSERT INTO public.sale_items
      (sale_id, product_id, qty, unit_price_cents, line_total_cents, costo_total_cents)
    VALUES (v_sale_id, v_product.id, v_qty, v_product.price_cents, v_line_total, v_costo);

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
  --
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

    -- Lock the customer, not the movements: the balance is an aggregate and
    -- there is no row to lock. Two tills spending the same credit at once
    -- would otherwise both read it as available and both succeed.
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
