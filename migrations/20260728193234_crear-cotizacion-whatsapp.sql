-- The WhatsApp agent creates a quote on the customer's behalf.
--
-- No staff user is authenticated (the agent runs from the Kapso webhook), so
-- this is SECURITY DEFINER with a fixed system caller — NOT crear_cotizacion,
-- which requires requesting_user_id(). Items are resolved by SKU (unique).
-- The quote is canal='whatsapp' and UNASSIGNED (vendedor_id NULL) so it
-- broadcasts to every seller to claim, exactly like the spec. Prices are
-- snapshot, no stock is reserved. The customer phone lands in notas so whoever
-- claims it can reach them.

CREATE OR REPLACE FUNCTION public.crear_cotizacion_whatsapp(
  p_items    jsonb,   -- [{sku, qty}]
  p_telefono text
)
RETURNS TABLE (id uuid, folio text, share_token uuid, total_cents int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_id    uuid;
  v_folio text;
  v_token uuid;
  v_item  jsonb;
  v_p     public.products%ROWTYPE;
  v_qty   int;
  v_sub   int := 0;
  v_tel   text := NULLIF(btrim(coalesce(p_telefono, '')), '');
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'cotización sin productos';
  END IF;

  v_folio := 'COT-' || to_char(nextval('public.cotizacion_seq'), 'FM000000');

  INSERT INTO public.cotizaciones
    (folio, vendedor_id, estado, canal, notas, created_by, expires_at)
  VALUES
    (v_folio, NULL, 'pendiente', 'whatsapp',
     CASE WHEN v_tel IS NULL THEN NULL ELSE 'WhatsApp: ' || v_tel END,
     'agente_whatsapp', now() + interval '7 days')
  RETURNING cotizaciones.id, cotizaciones.share_token INTO v_id, v_token;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'qty')::int;
    IF v_qty IS NULL OR v_qty <= 0 THEN v_qty := 1; END IF;

    SELECT * INTO v_p FROM public.products
     WHERE sku = (v_item->>'sku') AND is_active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'producto no encontrado: %', v_item->>'sku';
    END IF;

    INSERT INTO public.cotizacion_items
      (cotizacion_id, product_id, nombre, sku, qty, unit_price_cents, cost_cents, line_total_cents)
    VALUES (v_id, v_p.id, v_p.name, v_p.sku, v_qty, v_p.price_cents, v_p.cost_cents, v_p.price_cents * v_qty);

    v_sub := v_sub + v_p.price_cents * v_qty;
  END LOOP;

  UPDATE public.cotizaciones
     SET subtotal_cents = v_sub, total_cents = v_sub
   WHERE cotizaciones.id = v_id;

  RETURN QUERY SELECT v_id, v_folio, v_token, v_sub;
END;
$$;
