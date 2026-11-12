-- The WhatsApp quote can now hold one SKU from several almacenes: 1 from
-- Mostrador at its price, 3 from Guadalajara at theirs. Each item may carry the
-- exact product row (product_id); a call still replaces ALL lines of a SKU it
-- names (qty stays the total wanted), so sending only Mostrador:1 drops the
-- Guadalajara line.
--
-- Items with only a sku pick the row a customer would be sold first: a
-- sellable almacén with stock, soonest delivery, oldest almacén. Before this,
-- SELECT INTO took whichever row Postgres returned first.
CREATE OR REPLACE FUNCTION public.agregar_a_cotizacion_whatsapp(p_telefono text, p_items jsonb)
 RETURNS TABLE(id uuid, folio text, share_token uuid, total_cents integer, creada boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
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
  v_limpias text[] := '{}';
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'sin productos';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(coalesce(p_telefono, '')));

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
    IF v_cust_id IS NOT NULL THEN
      UPDATE public.cotizaciones SET customer_id = v_cust_id
       WHERE cotizaciones.id = v_id AND customer_id IS NULL;
    END IF;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'qty')::int;
    IF v_qty IS NULL OR v_qty <= 0 THEN v_qty := 1; END IF;

    IF coalesce(v_item->>'product_id', '') <> '' THEN
      SELECT * INTO v_p FROM public.products
       WHERE products.id = (v_item->>'product_id')::uuid AND is_active;
    ELSE
      SELECT p.* INTO v_p
        FROM public.products p
        JOIN public.inventories i ON i.id = p.inventory_id
       WHERE p.sku = (v_item->>'sku') AND p.is_active
       ORDER BY i.solo_consulta, (p.quantity > 0) DESC,
                coalesce(i.entrega_dias_habiles, 0), i.created_at
       LIMIT 1;
    END IF;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'producto no encontrado: %', coalesce(v_item->>'product_id', v_item->>'sku');
    END IF;

    v_unit := CASE
      WHEN v_desc > 0 THEN round(v_p.price_cents * (100 - v_desc) / 100.0)::int
      ELSE v_p.price_cents
    END;

    -- First mention of this SKU in the call clears its old lines; the rest of
    -- the call's rows for it (other almacenes) add up.
    IF NOT (v_p.sku = ANY (v_limpias)) THEN
      DELETE FROM public.cotizacion_items
       WHERE cotizacion_id = v_id AND sku = v_p.sku;
      v_limpias := v_limpias || v_p.sku;
    END IF;
    INSERT INTO public.cotizacion_items
      (cotizacion_id, product_id, nombre, sku, qty, unit_price_cents, cost_cents, line_total_cents)
    VALUES (v_id, v_p.id, v_p.name, v_p.sku, v_qty, v_unit, v_p.cost_cents, v_unit * v_qty);
  END LOOP;

  RETURN QUERY SELECT v_id, v_folio, v_token, public.recalcular_cotizacion(v_id), v_creada;
END;
$function$;
