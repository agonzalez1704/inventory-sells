-- Void a completed sale (e.g. a duplicate). Admin only. Restores stock, removes
-- its abonos (so the phantom cash leaves the corte), and marks it void. The
-- corte reads cash from sale_pagos + completed sales, so both are cleared here.
CREATE OR REPLACE FUNCTION public.anular_venta(p_sale_id uuid)
RETURNS uuid
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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'solo administradores pueden anular ventas' USING errcode = '42501';
  END IF;

  SELECT status INTO v_status FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'venta no encontrada';
  END IF;
  IF v_status <> 'completed' THEN
    RAISE EXCEPTION 'solo se anulan ventas cerradas (status %)', v_status;
  END IF;

  -- Return the sold units to stock.
  FOR v_item IN SELECT product_id, qty FROM public.sale_items WHERE sale_id = p_sale_id
  LOOP
    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
    VALUES (v_item.product_id, v_item.qty, 'return', p_sale_id, v_uid);
  END LOOP;

  -- Drop its abonos so the cash disappears from the corte.
  DELETE FROM public.sale_pagos WHERE sale_id = p_sale_id;

  UPDATE public.sales SET status = 'void' WHERE id = p_sale_id;
  RETURN p_sale_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.anular_venta(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.anular_venta(uuid) TO authenticated;
