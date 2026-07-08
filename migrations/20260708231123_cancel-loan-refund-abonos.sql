-- Fix: cancelling a fiado that had abonos (anticipos) must return that cash.
-- Before, cancel_loan only restored stock + voided the sale, leaving the abonos
-- (sale_pagos) counted as income → the corte's efectivo never dropped when the
-- customer got their anticipo back.
--
-- Fix: on cancel, record the refund as a cash outflow TODAY (a `devoluciones`
-- row per payment method), leaving the historical abonos intact. Net cash over
-- time is zero (money in then out), and today's corte reflects the refund —
-- matching the physical cash handed back. No profit is reversed (a pending fiado
-- never recognized any).
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

  -- Restore stock.
  FOR v_item IN SELECT product_id, qty FROM public.sale_items WHERE sale_id = p_sale_id
  LOOP
    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
    VALUES (v_item.product_id, v_item.qty, 'return', p_sale_id, v_uid);
  END LOOP;

  -- Refund any anticipos as a cash outflow today, grouped by method.
  FOR v_pay IN
    SELECT metodo, SUM(monto_cents) AS total
    FROM public.sale_pagos WHERE sale_id = p_sale_id
    GROUP BY metodo
  LOOP
    INSERT INTO public.devoluciones (sale_id, monto_cents, metodo, motivo, created_by)
    VALUES (p_sale_id, v_pay.total, v_pay.metodo, 'Cancelación de fiado', v_uid);
  END LOOP;

  UPDATE public.sales SET status = 'void' WHERE id = p_sale_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_loan(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cancel_loan(uuid) TO authenticated;

-- Backfill the already-cancelled fiado that lost its anticipo from the corte:
-- record the refund now (one row per method) if it doesn't have one yet.
INSERT INTO public.devoluciones (sale_id, monto_cents, metodo, motivo, created_by)
SELECT sp.sale_id, SUM(sp.monto_cents), sp.metodo,
       'Cancelación de fiado (retroactivo)', 'backfill'
FROM public.sale_pagos sp
JOIN public.sales s ON s.id = sp.sale_id AND s.status = 'void'
WHERE NOT EXISTS (SELECT 1 FROM public.devoluciones d WHERE d.sale_id = sp.sale_id)
GROUP BY sp.sale_id, sp.metodo;
