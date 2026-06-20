-- Loans / fiado: lend a product, payment pending. Stock is decremented
-- immediately (not sellable), but revenue is counted only once collected.
-- A loan is a sale with status='pending' + a free-text note (person/place).
-- No client entity is created.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS note       TEXT,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

-- Loans have no payment yet, so payment_method may be NULL until collected.
ALTER TABLE public.sales ALTER COLUMN payment_method DROP NOT NULL;

ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_status_check;
ALTER TABLE public.sales
  ADD CONSTRAINT sales_status_check CHECK (status IN ('pending', 'completed', 'void'));

CREATE INDEX IF NOT EXISTS idx_sales_status ON public.sales(status);

-- ============================================================
-- register_loan — lend items (status 'pending'), decrement stock, no payment
-- ============================================================
CREATE OR REPLACE FUNCTION public.register_loan(
  p_items jsonb,
  p_note  text DEFAULT NULL
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'no items';
  END IF;

  INSERT INTO public.sales (status, payment_method, note, sold_by, total_cents)
  VALUES ('pending', NULL, p_note, v_uid, 0)
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

REVOKE EXECUTE ON FUNCTION public.register_loan(jsonb, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.register_loan(jsonb, text) TO authenticated;

-- ============================================================
-- settle_loan — collect payment: pending loan becomes a completed sale
-- ============================================================
CREATE OR REPLACE FUNCTION public.settle_loan(
  p_sale_id        uuid,
  p_payment_method text DEFAULT 'efectivo'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid    text := public.requesting_user_id();
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF p_payment_method NOT IN ('efectivo', 'tarjeta', 'transferencia', 'otro') THEN
    RAISE EXCEPTION 'invalid payment method %', p_payment_method;
  END IF;

  SELECT status INTO v_status FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'loan not found';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'loan is not pending (status %)', v_status;
  END IF;

  UPDATE public.sales
  SET status = 'completed', payment_method = p_payment_method, settled_at = NOW()
  WHERE id = p_sale_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.settle_loan(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.settle_loan(uuid, text) TO authenticated;

-- ============================================================
-- cancel_loan — item returned without payment: void + restore stock
-- ============================================================
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

  UPDATE public.sales SET status = 'void' WHERE id = p_sale_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_loan(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cancel_loan(uuid) TO authenticated;
