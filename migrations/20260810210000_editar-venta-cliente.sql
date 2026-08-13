-- Assign a registered customer when correcting a sale.
--
-- The correction form only ever wrote customer_name, a free-text field. So a
-- sale rung up on Mostrador could be relabelled with someone's name and still
-- have no customer_id — which reads as fixed and is not. Everything that hangs
-- off the person rather than the label keeps refusing it: a warranty, and
-- therefore the credit a warranty leaves.
--
-- p_customer_id defaults to a sentinel rather than NULL, because NULL is a
-- meaningful value here — it is how you detach a sale from a customer. Without
-- the sentinel there is no way to tell "leave it alone" from "clear it", and
-- every save that did not touch the picker would silently unassign.
CREATE OR REPLACE FUNCTION public.editar_venta(
  p_sale_id        uuid,
  p_payment_method text,
  p_customer_name  text DEFAULT NULL,
  p_customer_id    uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid       text := public.requesting_user_id();
  v_status    text;
  v_centinela uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_nombre    text;
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

  IF p_customer_id IS DISTINCT FROM v_centinela THEN
    -- The name follows the id, always. Two fields that can disagree about who
    -- the customer is are two answers to one question, and the ticket and the
    -- reports read different ones.
    IF p_customer_id IS NULL THEN
      UPDATE public.sales
      SET customer_id = NULL,
          customer_name = NULLIF(TRIM(p_customer_name), '')
      WHERE id = p_sale_id;
    ELSE
      SELECT nombre INTO v_nombre FROM public.customers WHERE id = p_customer_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'cliente no encontrado';
      END IF;
      UPDATE public.sales
      SET customer_id = p_customer_id, customer_name = v_nombre
      WHERE id = p_sale_id;
    END IF;
  ELSE
    UPDATE public.sales
    SET customer_name = NULLIF(TRIM(p_customer_name), '')
    WHERE id = p_sale_id;
  END IF;

  UPDATE public.sales SET payment_method = p_payment_method WHERE id = p_sale_id;

  -- Keep the collected-cash records in sync so the corte de caja reflects the
  -- correction. Fiado cash is counted from sale_pagos.metodo; a direct sale has
  -- no sale_pagos, so this is a no-op there.
  UPDATE public.sale_pagos
  SET metodo = p_payment_method
  WHERE sale_id = p_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.editar_venta(uuid, text, text, uuid) TO authenticated;
