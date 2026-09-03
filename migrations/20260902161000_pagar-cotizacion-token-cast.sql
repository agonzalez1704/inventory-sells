-- share_token is uuid; comparing as text makes a malformed public token read
-- as "cotización no disponible" instead of a raw SQL cast error.
CREATE OR REPLACE FUNCTION public.crear_orden_desde_cotizacion(
  p_token text, p_nombre text, p_email text, p_telefono text,
  p_cp text, p_estado text, p_municipio text, p_direccion text,
  p_referencias text, p_envio_cents integer, p_envio_desc text, p_tipo_entrega text
)
RETURNS TABLE(orden_id uuid, folio text, total_cents integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_c        public.cotizaciones%ROWTYPE;
  v_existente public.ordenes_web%ROWTYPE;
  v_id       uuid;
  v_folio    text;
  v_item     record;
  v_prod     public.products%ROWTYPE;
  v_drop     boolean;
  v_subtotal int := 0;
  v_recoger  boolean := (p_tipo_entrega = 'recoger');
BEGIN
  IF p_tipo_entrega NOT IN ('envio', 'recoger') THEN
    RAISE EXCEPTION 'tipo de entrega inválido';
  END IF;
  IF coalesce(btrim(p_nombre), '') = '' OR coalesce(btrim(p_email), '') = ''
     OR coalesce(btrim(p_telefono), '') = '' THEN
    RAISE EXCEPTION 'faltan datos del cliente';
  END IF;
  IF NOT v_recoger THEN
    IF p_cp !~ '^\d{5}$' THEN RAISE EXCEPTION 'código postal inválido'; END IF;
    IF p_envio_cents IS NULL OR p_envio_cents < 0 THEN RAISE EXCEPTION 'envío inválido'; END IF;
  END IF;

  -- share_token is a uuid column; a malformed token must read as "not found",
  -- never as a SQL error a customer can trigger.
  SELECT * INTO v_c FROM public.cotizaciones
  WHERE share_token::text = p_token AND estado IN ('pendiente', 'autorizada')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'la cotización no está disponible para pago';
  END IF;
  IF v_c.expires_at IS NOT NULL AND v_c.expires_at < now() THEN
    RAISE EXCEPTION 'la cotización ya venció: pide una nueva por WhatsApp';
  END IF;

  -- Second click / double tap: hand back the live order, don't reserve twice.
  SELECT * INTO v_existente FROM public.ordenes_web
  WHERE cotizacion_id = v_c.id AND status <> 'cancelada'
  ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_existente.id, v_existente.folio, v_existente.total_cents;
    RETURN;
  END IF;

  v_folio := 'LD-' || to_char(nextval('public.orden_web_seq'), 'FM000000');
  INSERT INTO public.ordenes_web (
    folio, nombre, email, telefono, cp, estado, municipio, direccion, referencias,
    envio_cents, envio_desc, subtotal_cents, total_cents, tipo_entrega, cotizacion_id
  ) VALUES (
    v_folio, btrim(p_nombre), btrim(p_email), btrim(p_telefono),
    CASE WHEN v_recoger THEN NULL ELSE p_cp END,
    CASE WHEN v_recoger THEN NULL ELSE p_estado END,
    CASE WHEN v_recoger THEN NULL ELSE p_municipio END,
    CASE WHEN v_recoger THEN NULL ELSE p_direccion END,
    NULLIF(btrim(coalesce(p_referencias, '')), ''),
    CASE WHEN v_recoger THEN 0 ELSE p_envio_cents END,
    CASE WHEN v_recoger THEN 'Recoger en tienda' ELSE p_envio_desc END,
    0, 0, p_tipo_entrega, v_c.id
  ) RETURNING id INTO v_id;

  FOR v_item IN
    SELECT ci.product_id, ci.qty, ci.unit_price_cents
    FROM public.cotizacion_items ci WHERE ci.cotizacion_id = v_c.id
  LOOP
    SELECT * INTO v_prod FROM public.products
    WHERE id = v_item.product_id AND is_active FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'un producto de la cotización ya no está disponible';
    END IF;

    SELECT coalesce(i.es_dropship, false) INTO v_drop
    FROM public.inventories i WHERE i.id = v_prod.inventory_id;
    IF NOT coalesce(v_drop, false) THEN
      IF v_prod.quantity < v_item.qty THEN
        RAISE EXCEPTION 'Ya no tenemos suficiente stock de %', v_prod.name
          USING errcode = '23514';
      END IF;
      INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
      VALUES (v_prod.id, -v_item.qty, 'reserva', v_id, 'online');
    END IF;

    -- The QUOTED unit price, not today's list price: that is the agreement.
    INSERT INTO public.orden_web_items (orden_id, product_id, nombre, qty, unit_price_cents)
    VALUES (v_id, v_prod.id, v_prod.name, v_item.qty, v_item.unit_price_cents);
    v_subtotal := v_subtotal + v_item.unit_price_cents * v_item.qty;
  END LOOP;

  IF v_subtotal = 0 THEN
    RAISE EXCEPTION 'la cotización no tiene productos';
  END IF;

  UPDATE public.ordenes_web
     SET subtotal_cents = v_subtotal,
         total_cents = v_subtotal + (CASE WHEN v_recoger THEN 0 ELSE p_envio_cents END)
   WHERE id = v_id;

  -- Paying IS authorizing: a quote that reaches checkout skips the button.
  IF v_c.estado = 'pendiente' THEN
    UPDATE public.cotizaciones
       SET estado = 'autorizada', autorizada_at = now()
     WHERE id = v_c.id;
  END IF;

  RETURN QUERY SELECT v_id, v_folio,
    v_subtotal + (CASE WHEN v_recoger THEN 0 ELSE p_envio_cents END);
END;
$$;
REVOKE ALL ON FUNCTION public.crear_orden_desde_cotizacion(text,text,text,text,text,text,text,text,text,integer,text,text) FROM PUBLIC;
