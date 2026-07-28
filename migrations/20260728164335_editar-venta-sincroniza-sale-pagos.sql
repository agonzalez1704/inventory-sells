-- Fix: editing a sale's payment method didn't reach the corte de caja for fiados.
--
-- The corte counts a fiado's cash from sale_pagos.metodo (the collection record),
-- not from sales.payment_method. editar_venta only updated sales.payment_method,
-- so correcting a collected fiado from efectivo → transferencia left the sale_pago
-- as efectivo and the corte kept showing efectivo. Now editar_venta also syncs
-- the sale's sale_pagos.metodo. No-op for direct sales (they have no sale_pagos).

CREATE OR REPLACE FUNCTION public.editar_venta(
  p_sale_id        uuid,
  p_payment_method text,
  p_customer_name  text DEFAULT NULL
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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only' USING errcode = '42501';
  END IF;
  IF p_payment_method NOT IN ('efectivo', 'tarjeta', 'transferencia', 'otro') THEN
    RAISE EXCEPTION 'invalid payment method %', p_payment_method;
  END IF;

  SELECT status INTO v_status FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'venta no encontrada';
  END IF;
  IF v_status <> 'completed' THEN
    RAISE EXCEPTION 'solo ventas completadas (status %)', v_status;
  END IF;

  UPDATE public.sales
  SET payment_method = p_payment_method,
      customer_name  = NULLIF(TRIM(p_customer_name), '')
  WHERE id = p_sale_id;

  -- Keep the collected-cash records in sync so the corte de caja reflects the
  -- correction. Fiado cash is counted from sale_pagos.metodo; a direct sale has
  -- no sale_pagos, so this is a no-op there.
  UPDATE public.sale_pagos
  SET metodo = p_payment_method
  WHERE sale_id = p_sale_id;
END;
$$;
