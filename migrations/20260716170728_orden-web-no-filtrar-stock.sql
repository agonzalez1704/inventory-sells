-- crear_orden_web is reached from the PUBLIC storefront, and its out-of-stock
-- error spelled out the on-hand count ("hay %, pide %"). That message surfaces
-- to an anonymous visitor, and exact stock is staff-only data — the same rule
-- that keeps cost/stock/SKU off /tienda. Make it generic.
CREATE OR REPLACE FUNCTION public.crear_orden_web(
  p_items       jsonb,
  p_nombre      text,
  p_email       text,
  p_telefono    text,
  p_cp          text,
  p_estado      text,
  p_municipio   text,
  p_direccion   text,
  p_referencias text,
  p_envio_cents int,
  p_envio_desc  text
)
RETURNS TABLE (orden_id uuid, folio text, subtotal_cents int, total_cents int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_id       uuid;
  v_folio    text;
  v_item     jsonb;
  v_prod     public.products%ROWTYPE;
  v_qty      int;
  v_subtotal int := 0;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'carrito vacío';
  END IF;
  IF coalesce(btrim(p_nombre), '') = '' OR coalesce(btrim(p_email), '') = ''
     OR coalesce(btrim(p_telefono), '') = '' THEN
    RAISE EXCEPTION 'faltan datos del cliente';
  END IF;
  IF p_cp !~ '^\d{5}$' THEN RAISE EXCEPTION 'código postal inválido'; END IF;
  IF p_envio_cents IS NULL OR p_envio_cents < 0 THEN RAISE EXCEPTION 'envío inválido'; END IF;

  v_folio := 'LD-' || to_char(nextval('public.orden_web_seq'), 'FM000000');

  INSERT INTO public.ordenes_web (
    folio, nombre, email, telefono, cp, estado, municipio, direccion, referencias,
    envio_cents, envio_desc, subtotal_cents, total_cents
  ) VALUES (
    v_folio, btrim(p_nombre), btrim(p_email), btrim(p_telefono), p_cp, p_estado,
    p_municipio, p_direccion, NULLIF(btrim(coalesce(p_referencias, '')), ''),
    p_envio_cents, p_envio_desc, 0, 0
  ) RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'qty')::int;
    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'cantidad inválida'; END IF;

    SELECT * INTO v_prod FROM public.products
    WHERE id = (v_item->>'product_id')::uuid AND is_active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'producto no disponible'; END IF;
    IF v_prod.quantity < v_qty THEN
      -- Deliberately no counts: this message reaches the public storefront.
      RAISE EXCEPTION 'Ya no tenemos suficiente stock de %', v_prod.name
        USING errcode = '23514';
    END IF;

    INSERT INTO public.orden_web_items (orden_id, product_id, nombre, qty, unit_price_cents)
    VALUES (v_id, v_prod.id, v_prod.name, v_qty, v_prod.price_cents);

    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
    VALUES (v_prod.id, -v_qty, 'reserva', v_id, 'online');

    v_subtotal := v_subtotal + v_prod.price_cents * v_qty;
  END LOOP;

  UPDATE public.ordenes_web
     SET subtotal_cents = v_subtotal, total_cents = v_subtotal + p_envio_cents
   WHERE id = v_id;

  RETURN QUERY SELECT v_id, v_folio, v_subtotal, v_subtotal + p_envio_cents;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.crear_orden_web(jsonb, text, text, text, text, text, text, text, text, int, text) FROM PUBLIC;
