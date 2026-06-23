-- Correct a completed sale's payment method / customer (admin only).
-- Does NOT touch items or totals (those affect stock).
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
END;
$$;

REVOKE EXECUTE ON FUNCTION public.editar_venta(uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.editar_venta(uuid, text, text) TO authenticated;
