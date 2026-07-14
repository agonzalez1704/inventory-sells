-- Any staff member may set a product photo, but `authenticated` only holds a
-- column-scoped UPDATE grant (name, price_cents, cost_cents, …) and the only
-- UPDATE policy on products is admin-only. Widening either one would hand every
-- seller write access to cost/price — so the photo goes through a narrow
-- SECURITY DEFINER RPC that can touch nothing but the image columns.
CREATE OR REPLACE FUNCTION public.set_product_image(
  p_product_id uuid,
  p_url        text,
  p_key        text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid text := public.requesting_user_id();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;

  UPDATE public.products
     SET image_url = p_url, image_key = p_key
   WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'producto no encontrado';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_product_image(uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_product_image(uuid, text, text) TO authenticated;
