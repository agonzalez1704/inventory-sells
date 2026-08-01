-- The agent creates one quote per conversation, not one per tool call.
--
-- The model calls agregar_al_pedido once PER PRODUCT, in parallel. Both calls
-- read the draft before either wrote it, both saw "no quote yet", and both
-- created one — two quotes in the same second for the same customer. Deciding
-- create-vs-edit in app code cannot be made safe: the read and the write are
-- separate round-trips.
--
-- So the decision moves into the database, under an advisory lock keyed by
-- phone. Calls for one number serialize; calls for different numbers don't
-- block each other. And because each call now sends only the items it wants to
-- ADD (a delta, merged by SKU) instead of the whole basket, concurrent calls
-- are commutative: "add A" + "add B" ends at {A,B} whatever the order.

-- Find the conversation's live quote (whatsapp, still pending, recent).
-- The phone lives in `notas` as 'WhatsApp: <number>' — same shape the create
-- RPC writes.
CREATE OR REPLACE FUNCTION public.cotizacion_wa_viva(p_telefono text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT c.id
    FROM public.cotizaciones c
   WHERE c.canal = 'whatsapp'
     AND c.estado = 'pendiente'
     AND c.notas = 'WhatsApp: ' || p_telefono
     AND c.created_at > now() - interval '6 hours'
   ORDER BY c.created_at DESC
   LIMIT 1;
$$;

-- Recalculate a quote's stored totals from its items.
CREATE OR REPLACE FUNCTION public.recalcular_cotizacion(p_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_sub int;
BEGIN
  SELECT coalesce(sum(line_total_cents), 0) INTO v_sub
    FROM public.cotizacion_items WHERE cotizacion_id = p_id;
  UPDATE public.cotizaciones
     SET subtotal_cents = v_sub, total_cents = v_sub
   WHERE id = p_id;
  RETURN v_sub;
END;
$$;

-- Add items to the conversation's quote, creating it on first use.
-- p_items = [{sku, qty}]; qty is the TOTAL wanted for that SKU (replaces).
CREATE OR REPLACE FUNCTION public.agregar_a_cotizacion_whatsapp(
  p_telefono text,
  p_items    jsonb
)
RETURNS TABLE (id uuid, folio text, share_token uuid, total_cents int, creada boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_id      uuid;
  v_folio   text;
  v_token   uuid;
  v_creada  boolean := false;
  v_item    jsonb;
  v_p       public.products%ROWTYPE;
  v_qty     int;
  v_unit    int;
  v_norm    text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_cust_id uuid;
  v_desc    numeric := 0;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'sin productos';
  END IF;

  -- Serialize every call for this phone; different phones never contend.
  PERFORM pg_advisory_xact_lock(hashtext(coalesce(p_telefono, '')));

  -- Registered customer (never the Mostrador placeholder) for their discount.
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

  v_id := public.cotizacion_wa_viva(p_telefono);

  IF v_id IS NULL THEN
    v_folio := 'COT-' || to_char(nextval('public.cotizacion_seq'), 'FM000000');
    INSERT INTO public.cotizaciones
      (folio, vendedor_id, estado, canal, customer_id, notas, created_by, expires_at)
    VALUES
      (v_folio, NULL, 'pendiente', 'whatsapp', v_cust_id,
       'WhatsApp: ' || p_telefono, 'agente_whatsapp', now() + interval '7 days')
    RETURNING cotizaciones.id, cotizaciones.share_token INTO v_id, v_token;
    v_creada := true;
  ELSE
    SELECT c.folio, c.share_token INTO v_folio, v_token
      FROM public.cotizaciones c WHERE c.id = v_id;
    -- A quote created before the customer registered gets linked now.
    IF v_cust_id IS NOT NULL THEN
      UPDATE public.cotizaciones SET customer_id = v_cust_id
       WHERE cotizaciones.id = v_id AND customer_id IS NULL;
    END IF;
  END IF;

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

    -- Replace this SKU's line (qty is the total wanted), leave the rest alone.
    DELETE FROM public.cotizacion_items
     WHERE cotizacion_id = v_id AND sku = v_p.sku;
    INSERT INTO public.cotizacion_items
      (cotizacion_id, product_id, nombre, sku, qty, unit_price_cents, cost_cents, line_total_cents)
    VALUES (v_id, v_p.id, v_p.name, v_p.sku, v_qty, v_unit, v_p.cost_cents, v_unit * v_qty);
  END LOOP;

  RETURN QUERY SELECT v_id, v_folio, v_token, public.recalcular_cotizacion(v_id), v_creada;
END;
$$;

-- Remove one SKU (or everything) from the conversation's quote.
CREATE OR REPLACE FUNCTION public.quitar_de_cotizacion_whatsapp(
  p_telefono text,
  p_sku      text DEFAULT NULL,
  p_todo     boolean DEFAULT false
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
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(coalesce(p_telefono, '')));
  v_id := public.cotizacion_wa_viva(p_telefono);
  IF v_id IS NULL THEN
    RETURN;  -- nothing live for this conversation
  END IF;

  IF p_todo THEN
    DELETE FROM public.cotizacion_items WHERE cotizacion_id = v_id;
  ELSIF p_sku IS NOT NULL THEN
    DELETE FROM public.cotizacion_items WHERE cotizacion_id = v_id AND sku = p_sku;
  END IF;

  SELECT c.folio, c.share_token INTO v_folio, v_token
    FROM public.cotizaciones c WHERE c.id = v_id;
  RETURN QUERY SELECT v_id, v_folio, v_token, public.recalcular_cotizacion(v_id);
END;
$$;
