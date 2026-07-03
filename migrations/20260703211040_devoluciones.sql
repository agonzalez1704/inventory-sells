-- Partial returns (devoluciones). The original completed sale is kept intact;
-- a devolución records the refunded amount as a cash outflow on the day it
-- happens (cash-correct per day), restores stock, and can't exceed what was
-- sold (minus prior returns).
CREATE TABLE public.devoluciones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id     uuid NOT NULL REFERENCES public.sales(id),
  monto_cents int  NOT NULL CHECK (monto_cents > 0),
  metodo      text NOT NULL DEFAULT 'efectivo'
                CHECK (metodo IN ('efectivo', 'tarjeta', 'transferencia', 'otro')),
  motivo      text,
  created_by  text NOT NULL DEFAULT public.requesting_user_id(),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX devoluciones_created_at_idx ON public.devoluciones (created_at);
CREATE INDEX devoluciones_sale_idx       ON public.devoluciones (sale_id);

CREATE TABLE public.devolucion_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  devolucion_id    uuid NOT NULL REFERENCES public.devoluciones(id) ON DELETE CASCADE,
  product_id       uuid NOT NULL REFERENCES public.products(id),
  qty              int  NOT NULL CHECK (qty > 0),
  unit_price_cents int  NOT NULL
);
CREATE INDEX devolucion_items_dev_idx ON public.devolucion_items (devolucion_id);

ALTER TABLE public.devoluciones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devolucion_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read devoluciones"
  ON public.devoluciones FOR SELECT TO authenticated
  USING (public.requesting_user_id() IS NOT NULL);
CREATE POLICY "authenticated read devolucion_items"
  ON public.devolucion_items FOR SELECT TO authenticated
  USING (public.requesting_user_id() IS NOT NULL);

-- Writes go only through the devolver_items RPC (SECURITY DEFINER).
GRANT SELECT ON public.devoluciones    TO authenticated;
GRANT SELECT ON public.devolucion_items TO authenticated;

-- Refund some items from a completed sale. Restores stock, records the refund
-- (amount = the price the customer paid on the sale), rejects over-returns.
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

  -- Pass 1: validate and total the refund at the prices the customer paid.
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

  -- Pass 2: record the returned lines and restore stock.
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

REVOKE EXECUTE ON FUNCTION public.devolver_items(uuid, jsonb, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.devolver_items(uuid, jsonb, text, text) TO authenticated;
