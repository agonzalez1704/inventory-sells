-- The missing link: a warranty the CUSTOMER claims from the shop.
--
-- garantias_proveedor is the other direction — what the shop claims from its
-- supplier. It requires a proveedor_id and has no idea a sale exists, so the
-- chain the counter actually works in (sale → warranty → credit) had a hole in
-- the middle, and the previous migration wired credit straight to a return.
--
-- The chain is enforced by the columns, not by the screens:
--   · a warranty cannot exist without the sale it came out of  (sale_id NOT NULL)
--   · credit cannot exist without the warranty it came out of  (see the CHECK below)
CREATE TABLE public.garantias_cliente (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id       uuid NOT NULL REFERENCES public.sales(id),
  -- Copied from the sale rather than derived on read: a warranty is settled
  -- with a person, and it must not change if the sale is ever re-assigned.
  customer_id   uuid NOT NULL REFERENCES public.customers(id),
  product_id    uuid NOT NULL REFERENCES public.products(id),
  qty           int  NOT NULL CHECK (qty > 0),
  -- What the customer paid for those units on that sale. The ceiling for any
  -- credit that comes out of it.
  monto_cents   int  NOT NULL CHECK (monto_cents >= 0),
  motivo        text,

  -- The operator's call at the counter. A part that failed must not go back on
  -- the shelf — somebody sells it again and the same customer returns. A part
  -- that is simply the wrong model is perfectly sellable.
  reingresa_stock boolean NOT NULL,

  estado        text NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente', 'aceptada', 'rechazada')),
  -- How it was settled once accepted.
  resolucion    text CHECK (resolucion IN ('saldo', 'cambio', 'efectivo')),

  -- Optional by design: plenty of parts are not covered by anyone upstream,
  -- and a forced link would fill the supplier queue with claims nobody will
  -- ever file.
  garantia_proveedor_id uuid REFERENCES public.garantias_proveedor(id),

  created_by    text NOT NULL DEFAULT public.requesting_user_id(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  resuelta_at   timestamptz,

  -- A settled warranty says how; an open one has not decided yet.
  CONSTRAINT garantia_resuelta_con_resolucion CHECK (
    (estado = 'pendiente' AND resolucion IS NULL) OR
    (estado = 'rechazada') OR
    (estado = 'aceptada' AND resolucion IS NOT NULL)
  )
);

CREATE INDEX garantias_cliente_venta_idx   ON public.garantias_cliente (sale_id);
CREATE INDEX garantias_cliente_cliente_idx ON public.garantias_cliente (customer_id, created_at DESC);
CREATE INDEX garantias_cliente_estado_idx  ON public.garantias_cliente (estado) WHERE estado = 'pendiente';

ALTER TABLE public.garantias_cliente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read garantias_cliente"
  ON public.garantias_cliente FOR SELECT TO authenticated
  USING (public.requesting_user_id() IS NOT NULL);

GRANT SELECT ON public.garantias_cliente TO authenticated;

-- ---- Credit now hangs off the warranty, not the return ----
ALTER TABLE public.saldo_movimientos
  ADD COLUMN garantia_id uuid REFERENCES public.garantias_cliente(id);

ALTER TABLE public.saldo_movimientos DROP CONSTRAINT saldo_con_origen;
ALTER TABLE public.saldo_movimientos DROP CONSTRAINT saldo_movimientos_origen_check;
ALTER TABLE public.saldo_movimientos ADD CONSTRAINT saldo_movimientos_origen_check
  CHECK (origen IN ('garantia', 'venta'));

-- The rule, one link further up than it was: every peso of credit names the
-- warranty it came out of, and that warranty names the sale. Credit with no
-- warranty behind it cannot be written, by anyone, through any path.
ALTER TABLE public.saldo_movimientos ADD CONSTRAINT saldo_con_origen CHECK (
  (monto_cents > 0 AND origen = 'garantia' AND garantia_id IS NOT NULL)
  OR
  (monto_cents < 0 AND origen = 'venta' AND sale_id IS NOT NULL)
);

-- devolucion_id stays for the rows that predate this — there are none, but the
-- column costs nothing and dropping a money column is not worth the risk.

-- ---- devolver_items goes back to being only a refund ----
--
-- 'saldo' was a refund method for one migration. It is not: a return hands
-- money back, a warranty is a claim about a defect, and only the second can
-- create credit now.
ALTER TABLE public.devoluciones DROP CONSTRAINT IF EXISTS devoluciones_metodo_check;
ALTER TABLE public.devoluciones ADD CONSTRAINT devoluciones_metodo_check
  CHECK (metodo IN ('efectivo', 'tarjeta', 'transferencia', 'otro'));

-- Restored verbatim from 20260703213622 — the version before credit was
-- bolted onto it.
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'solo administradores pueden hacer devoluciones' USING errcode = '42501';
  END IF;
  IF p_metodo IS NULL OR p_metodo NOT IN ('efectivo','tarjeta','transferencia','otro') THEN
    RAISE EXCEPTION 'método inválido';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'no items';
  END IF;

  SELECT status INTO v_status FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'venta no encontrada';
  END IF;
  IF v_status <> 'completed' THEN
    RAISE EXCEPTION 'solo se devuelven ventas cerradas (status %)', v_status;
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

  RETURN v_devid;
END;
$$;

-- ---- Register a warranty against a sale ----
--
-- One call, because the three effects are one event: the claim is recorded,
-- the part either goes back on the shelf or does not, and — if it is settled
-- as credit right there — the customer's balance moves. Split across calls, a
-- crash between them leaves a warranty with no credit or stock that moved for
-- a warranty that was never written.
CREATE OR REPLACE FUNCTION public.registrar_garantia_cliente(
  p_sale_id    uuid,
  p_product_id uuid,
  p_qty        int,
  p_motivo     text,
  p_reingresa  boolean,
  -- NULL leaves it pending: the part is taken in and settled later.
  p_resolucion text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid    text := public.requesting_user_id();
  v_status text;
  v_cust   uuid;
  v_sys    boolean;
  v_sold   int;
  v_unit   int;
  v_prev   int;
  v_monto  int;
  v_gid    uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'cantidad inválida';
  END IF;
  IF p_resolucion IS NOT NULL AND p_resolucion NOT IN ('saldo','cambio','efectivo') THEN
    RAISE EXCEPTION 'resolución inválida: %', p_resolucion;
  END IF;

  SELECT status, customer_id INTO v_status, v_cust
  FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'venta no encontrada';
  END IF;
  IF v_status <> 'completed' THEN
    RAISE EXCEPTION 'solo hay garantía sobre ventas cerradas (status %)', v_status;
  END IF;
  IF v_cust IS NULL THEN
    RAISE EXCEPTION 'la venta no tiene cliente: una garantía se resuelve con una persona';
  END IF;
  SELECT is_system INTO v_sys FROM public.customers WHERE id = v_cust;
  IF coalesce(v_sys, false) THEN
    RAISE EXCEPTION 'Mostrador no puede reclamar garantía: reasigna la venta al cliente';
  END IF;

  -- The part has to have been on that sale, and the same discipline as returns:
  -- you cannot claim more units than were sold, across all prior warranties.
  SELECT qty, unit_price_cents INTO v_sold, v_unit
  FROM public.sale_items WHERE sale_id = p_sale_id AND product_id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ese producto no está en la venta';
  END IF;

  SELECT coalesce(sum(qty), 0) INTO v_prev
  FROM public.garantias_cliente
  WHERE sale_id = p_sale_id AND product_id = p_product_id AND estado <> 'rechazada';

  IF p_qty > v_sold - v_prev THEN
    RAISE EXCEPTION 'la garantía excede lo vendido (vendido %, ya en garantía %)', v_sold, v_prev;
  END IF;

  -- Priced at what the customer actually paid on that sale, not today's price.
  v_monto := v_unit * p_qty;

  INSERT INTO public.garantias_cliente
    (sale_id, customer_id, product_id, qty, monto_cents, motivo,
     reingresa_stock, estado, resolucion, resuelta_at, created_by)
  VALUES
    (p_sale_id, v_cust, p_product_id, p_qty, v_monto, NULLIF(btrim(p_motivo), ''),
     coalesce(p_reingresa, false),
     CASE WHEN p_resolucion IS NULL THEN 'pendiente' ELSE 'aceptada' END,
     p_resolucion,
     CASE WHEN p_resolucion IS NULL THEN NULL ELSE now() END,
     v_uid)
  RETURNING id INTO v_gid;

  -- Only when the operator said the part is still sellable. A failed part that
  -- goes back on the shelf gets sold again and comes back again.
  IF coalesce(p_reingresa, false) THEN
    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
    VALUES (p_product_id, p_qty, 'return', p_sale_id, v_uid);
    UPDATE public.products SET quantity = quantity + p_qty WHERE id = p_product_id;
  END IF;

  IF p_resolucion = 'saldo' THEN
    INSERT INTO public.saldo_movimientos
      (customer_id, monto_cents, origen, garantia_id, motivo, created_by)
    VALUES (v_cust, v_monto, 'garantia', v_gid,
            coalesce(NULLIF(btrim(p_motivo), ''), 'Garantía'), v_uid);
  END IF;

  RETURN v_gid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_garantia_cliente(uuid, uuid, int, text, boolean, text)
  TO authenticated;
