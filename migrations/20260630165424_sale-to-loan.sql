-- Correct a sale registered by mistake that should have been a fiado: flip a
-- completed sale back to a pending loan. Stock is unchanged — both a sale and a
-- fiado take the item out of inventory — so this only resets the payment state
-- and sets the note (who owes).
CREATE OR REPLACE FUNCTION public.convertir_a_fiado(
  p_sale_id uuid,
  p_note    text
)
RETURNS uuid
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

  SELECT status INTO v_status FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'venta no encontrada';
  END IF;
  IF v_status = 'pending' THEN
    RAISE EXCEPTION 'esta venta ya es un fiado';
  END IF;
  IF v_status = 'void' THEN
    RAISE EXCEPTION 'la venta está cancelada';
  END IF;

  UPDATE public.sales
  SET status         = 'pending',
      payment_method = NULL,
      settled_at     = NULL,
      note           = COALESCE(NULLIF(btrim(p_note), ''), note, customer_name)
  WHERE id = p_sale_id;

  RETURN p_sale_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.convertir_a_fiado(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.convertir_a_fiado(uuid, text) TO authenticated;
