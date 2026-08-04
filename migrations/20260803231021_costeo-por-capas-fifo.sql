-- Costeo por capas, FIFO (R10).
--
-- The same part bought at different prices forms layers. Until now a sale's
-- profit was computed against products.cost_cents — the CURRENT catalog cost —
-- so editing a product's cost silently rewrote the profit of every past sale,
-- and two pieces bought at different prices reported the same margin.
--
-- Now each purchase line becomes a layer, and a sale consumes layers oldest
-- first, recording what those specific pieces actually cost. Physically the
-- pieces are indistinguishable, so this is purely an accounting choice and
-- costs the seller nothing at the register.

CREATE TABLE public.costo_capas (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id           uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  -- NULL for the opening layer that covers stock predating purchasing.
  compra_id            uuid REFERENCES public.compras(id) ON DELETE CASCADE,
  qty_inicial          int NOT NULL CHECK (qty_inicial > 0),
  qty_restante         int NOT NULL CHECK (qty_restante >= 0),
  costo_unitario_cents bigint NOT NULL CHECK (costo_unitario_cents >= 0),
  -- FIFO order. The opening layer is dated in the past so it always drains first.
  fecha                timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT costo_capas_restante_chk CHECK (qty_restante <= qty_inicial)
);

-- The consuming query: oldest layer with stock left, for this product.
CREATE INDEX costo_capas_fifo_idx
  ON public.costo_capas (product_id, fecha)
  WHERE qty_restante > 0;
CREATE INDEX costo_capas_compra_idx ON public.costo_capas (compra_id);

-- What a sold line actually cost us, resolved at sale time. NULL on historical
-- rows, which is why readers fall back to the catalog cost for those.
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS costo_total_cents bigint;

-- Opening layer: everything on the shelf right now predates purchasing, so it
-- gets one layer at the catalog cost, dated before any purchase can be. Without
-- this, the first sale of existing stock would find no layer to consume.
INSERT INTO public.costo_capas
  (product_id, compra_id, qty_inicial, qty_restante, costo_unitario_cents, fecha)
SELECT p.id, NULL, p.quantity, p.quantity, coalesce(p.cost_cents, 0),
       timestamptz '2000-01-01'
  FROM public.products p
 WHERE p.quantity > 0;

-- Consume `p_qty` pieces FIFO and return what they cost in total.
-- Layers are locked in FIFO order so two simultaneous sales of the same part
-- can't drain the same layer twice.
-- If the layers don't cover the quantity (stock that arrived outside a purchase
-- — an adjustment, an import), the remainder is valued at the catalog cost
-- rather than silently costing zero.
CREATE OR REPLACE FUNCTION public.consumir_capas_fifo(p_product_id uuid, p_qty int)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_faltan int := p_qty;
  v_costo  bigint := 0;
  v_toma   int;
  v_capa   record;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN RETURN 0; END IF;

  FOR v_capa IN
    SELECT id, qty_restante, costo_unitario_cents
      FROM public.costo_capas
     WHERE product_id = p_product_id AND qty_restante > 0
     ORDER BY fecha, created_at
     FOR UPDATE
  LOOP
    EXIT WHEN v_faltan <= 0;
    v_toma := LEAST(v_faltan, v_capa.qty_restante);
    UPDATE public.costo_capas
       SET qty_restante = qty_restante - v_toma
     WHERE id = v_capa.id;
    v_costo  := v_costo + v_toma::bigint * v_capa.costo_unitario_cents;
    v_faltan := v_faltan - v_toma;
  END LOOP;

  IF v_faltan > 0 THEN
    v_costo := v_costo + v_faltan::bigint *
      coalesce((SELECT cost_cents FROM public.products WHERE id = p_product_id), 0);
  END IF;

  RETURN v_costo;
END;
$$;

-- Receiving a purchase creates one layer per line, at the price actually paid.
CREATE OR REPLACE FUNCTION public.confirmar_compra(p_id uuid)
RETURNS TABLE (piezas int, total_cents bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_estado text;
  v_uid    text := coalesce(public.requesting_user_id(), 'sistema');
  v_piezas int;
  v_total  bigint;
BEGIN
  SELECT estado INTO v_estado FROM public.compras WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'compra no encontrada'; END IF;
  IF v_estado <> 'borrador' THEN
    RAISE EXCEPTION 'la compra ya fue % — solo un borrador se puede recibir', v_estado;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.compra_items WHERE compra_id = p_id) THEN
    RAISE EXCEPTION 'la compra no tiene productos';
  END IF;

  INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
  SELECT ci.product_id, ci.qty, 'purchase', p_id, v_uid
    FROM public.compra_items ci WHERE ci.compra_id = p_id;

  -- One cost layer per line: this is what makes FIFO possible downstream.
  INSERT INTO public.costo_capas
    (product_id, compra_id, qty_inicial, qty_restante, costo_unitario_cents)
  SELECT ci.product_id, p_id, ci.qty, ci.qty, ci.costo_unitario_cents
    FROM public.compra_items ci WHERE ci.compra_id = p_id;

  SELECT coalesce(sum(qty), 0), coalesce(sum(line_total_cents), 0)
    INTO v_piezas, v_total
    FROM public.compra_items WHERE compra_id = p_id;

  UPDATE public.compras SET estado = 'recibida', recibida_at = now() WHERE id = p_id;
  RETURN QUERY SELECT v_piezas, v_total;
END;
$$;

-- Cancelling a receipt removes its layers. Refuses if any piece from them was
-- already sold — the same honesty as the stock reversal, which fails on the
-- quantity CHECK in that case.
CREATE OR REPLACE FUNCTION public.cancelar_compra(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_estado text;
  v_uid    text := coalesce(public.requesting_user_id(), 'sistema');
BEGIN
  SELECT estado INTO v_estado FROM public.compras WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'compra no encontrada'; END IF;
  IF v_estado = 'cancelada' THEN RAISE EXCEPTION 'la compra ya está cancelada'; END IF;

  IF v_estado = 'recibida' THEN
    IF EXISTS (SELECT 1 FROM public.costo_capas
                WHERE compra_id = p_id AND qty_restante < qty_inicial) THEN
      RAISE EXCEPTION 'no se puede cancelar: ya se vendió mercancía de esta compra';
    END IF;
    DELETE FROM public.costo_capas WHERE compra_id = p_id;

    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
    SELECT ci.product_id, -ci.qty, 'purchase_cancel', p_id, v_uid
      FROM public.compra_items ci WHERE ci.compra_id = p_id;
  END IF;

  UPDATE public.compras SET estado = 'cancelada' WHERE id = p_id;
END;
$$;

-- register_sale now costs each line from the layers it consumes.
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

  RETURN v_sale_id;
END;
$$;

ALTER TABLE public.costo_capas ENABLE ROW LEVEL SECURITY;
-- Layers carry cost, so reading them is admin-only; the RPCs are SECURITY
-- DEFINER and do the real work.
CREATE POLICY "admin read costo_capas" ON public.costo_capas
  FOR SELECT TO authenticated USING (public.is_admin());
GRANT SELECT ON public.costo_capas TO authenticated;
GRANT EXECUTE ON FUNCTION public.consumir_capas_fifo(uuid, int) TO authenticated;
