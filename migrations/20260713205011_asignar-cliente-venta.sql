-- Attach (or change) a customer on a sale/fiado — used from the Fiados screen
-- when closing or taking a payment, so the fiado gets a real customer for
-- follow-up/notifications. Copies the customer's name into customer_name too.
CREATE OR REPLACE FUNCTION public.asignar_cliente_venta(
  p_sale_id     uuid,
  p_customer_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid  text := public.requesting_user_id();
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;

  SELECT nombre INTO v_name FROM public.customers WHERE id = p_customer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cliente no encontrado';
  END IF;

  UPDATE public.sales
     SET customer_id = p_customer_id, customer_name = v_name
   WHERE id = p_sale_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'venta no encontrada';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.asignar_cliente_venta(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.asignar_cliente_venta(uuid, uuid) TO authenticated;
