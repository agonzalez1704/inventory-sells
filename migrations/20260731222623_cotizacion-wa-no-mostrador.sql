-- WhatsApp quotes were landing on the "Mostrador" walk-in placeholder: its
-- seeded phone (0000000000) collides with any test/short number under the
-- last-10-digit match, and Mostrador is not a real person — every quote it
-- caught showed the wrong customer in the sellers' list.
--
-- Exclude system customers from phone resolution (detectarCliente already
-- does this app-side; the RPC did not).
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
  v_id       uuid;
  v_folio    text;
  v_token    uuid;
  v_item     jsonb;
  v_p        public.products%ROWTYPE;
  v_qty      int;
  v_unit     int;
  v_sub      int := 0;
  v_tel      text := NULLIF(btrim(coalesce(p_telefono, '')), '');
  v_norm     text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_cust_id  uuid;
  v_desc     numeric := 0;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'cotización sin productos';
  END IF;

  -- Registered customer? Last-10-digit match against primary + extra phones.
  -- Never the Mostrador/system placeholder.
  IF length(v_norm) >= 10 THEN
    SELECT c.id, c.descuento_pct INTO v_cust_id, v_desc
      FROM public.customer_phones_all pa
      JOIN public.customers c ON c.id = pa.customer_id
     WHERE right(pa.telefono_norm, 10) = right(v_norm, 10)
       AND c.is_active
       AND NOT coalesce(c.is_system, false)
     LIMIT 1;
    v_desc := coalesce(v_desc, 0);
  END IF;

  v_folio := 'COT-' || to_char(nextval('public.cotizacion_seq'), 'FM000000');

  INSERT INTO public.cotizaciones
    (folio, vendedor_id, estado, canal, customer_id, notas, created_by, expires_at)
  VALUES
    (v_folio, NULL, 'pendiente', 'whatsapp', v_cust_id,
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

    v_unit := CASE
      WHEN v_desc > 0 THEN round(v_p.price_cents * (100 - v_desc) / 100.0)::int
      ELSE v_p.price_cents
    END;

    INSERT INTO public.cotizacion_items
      (cotizacion_id, product_id, nombre, sku, qty, unit_price_cents, cost_cents, line_total_cents)
    VALUES (v_id, v_p.id, v_p.name, v_p.sku, v_qty, v_unit, v_p.cost_cents, v_unit * v_qty);

    v_sub := v_sub + v_unit * v_qty;
  END LOOP;

  UPDATE public.cotizaciones
     SET subtotal_cents = v_sub, total_cents = v_sub
   WHERE cotizaciones.id = v_id;

  RETURN QUERY SELECT v_id, v_folio, v_token, v_sub;
END;
$$;
