-- Cotizar por almacén. A WhatsApp customer asking for 4 when the counter has
-- 1 gets TWO quotes: Mostrador (today) and "sobrepedido" from Guadalajara, at
-- Guadalajara's price, each with its own folio, link and payment. Pieces from
-- such an almacén arrive one of two ways, and the customer picks:
--  * ruta: the truck's fixed days, free. inventories.ruta lists them as
--    [{"llega":1,"corte_dia":6,"corte":"10:00"}, …] (ISO weekdays, 1 = Monday):
--    Monday's truck takes orders until Saturday 10:00.
--  * exprés: expres_dias business days later when ordered before expres_corte,
--    for expres_costo_cents per quote (cotizaciones.cargo_expres_cents).

ALTER TABLE public.inventories
  ADD COLUMN IF NOT EXISTS ruta jsonb,
  ADD COLUMN IF NOT EXISTS expres_activo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expres_dias smallint NOT NULL DEFAULT 1
    CHECK (expres_dias BETWEEN 0 AND 30),
  ADD COLUMN IF NOT EXISTS expres_corte text NOT NULL DEFAULT '16:00'
    CHECK (expres_corte ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD COLUMN IF NOT EXISTS expres_costo_cents integer NOT NULL DEFAULT 0
    CHECK (expres_costo_cents >= 0);

ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS inventory_id uuid REFERENCES public.inventories(id),
  ADD COLUMN IF NOT EXISTS entrega text CHECK (entrega IN ('ruta', 'expres')),
  ADD COLUMN IF NOT EXISTS entrega_fecha date,
  ADD COLUMN IF NOT EXISTS pedir_antes timestamptz,
  ADD COLUMN IF NOT EXISTS cargo_expres_cents integer NOT NULL DEFAULT 0
    CHECK (cargo_expres_cents >= 0);

-- The counter: the oldest almacén. A quote with no inventory_id (every quote
-- made before this, and the ones staff build by hand) belongs to it.
CREATE OR REPLACE FUNCTION public.inventario_mostrador()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT i.id FROM public.inventories i ORDER BY i.created_at LIMIT 1;
$function$;

-- Every live WhatsApp quote of a conversation, one per almacén.
CREATE OR REPLACE FUNCTION public.cotizaciones_wa_vivas(p_telefono text)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT c.id
    FROM public.cotizaciones c
   WHERE c.canal = 'whatsapp'
     AND c.estado = 'pendiente'
     AND c.notas = 'WhatsApp: ' || p_telefono
     AND c.created_at > now() - interval '6 hours';
$function$;

CREATE OR REPLACE FUNCTION public.cotizacion_wa_viva(p_telefono text, p_inventory_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT c.id
    FROM public.cotizaciones c
   WHERE c.id IN (SELECT public.cotizaciones_wa_vivas(p_telefono))
     AND coalesce(c.inventory_id, public.inventario_mostrador()) = p_inventory_id
   ORDER BY c.created_at DESC
   LIMIT 1;
$function$;

-- The exprés charge rides on the total, and only while the quote has pieces.
CREATE OR REPLACE FUNCTION public.recalcular_cotizacion(p_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v_sub int; v_tot int;
BEGIN
  SELECT coalesce(sum(line_total_cents), 0) INTO v_sub
    FROM public.cotizacion_items WHERE cotizacion_id = p_id;
  UPDATE public.cotizaciones
     SET subtotal_cents = v_sub,
         total_cents = v_sub + CASE WHEN v_sub > 0 THEN cargo_expres_cents ELSE 0 END
   WHERE id = p_id
  RETURNING total_cents INTO v_tot;
  RETURN v_tot;
END;
$function$;

-- Items: {product_id | sku, qty, entrega?, fecha?, corte?}. Each lands in the
-- live quote of its own almacén (created on first use). A SKU named in the
-- call loses its old lines in EVERY live quote first, so moving it from
-- Guadalajara to Mostrador (or changing the qty) never leaves a stray line.
-- entrega/fecha/corte set how that almacén's quote arrives; exprés charges
-- the almacén's own fee, read here.
DROP FUNCTION IF EXISTS public.agregar_a_cotizacion_whatsapp(text, jsonb);
CREATE FUNCTION public.agregar_a_cotizacion_whatsapp(p_telefono text, p_items jsonb)
 RETURNS TABLE(id uuid, folio text, share_token uuid, total_cents integer, creada boolean, inventory_id uuid, almacen text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_item    jsonb;
  v_p       public.products%ROWTYPE;
  v_id      uuid;
  v_qty     int;
  v_unit    int;
  v_norm    text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_cust_id uuid;
  v_desc    numeric := 0;
  v_limpias text[] := '{}';
  v_tocadas uuid[] := '{}';
  v_nuevas  uuid[] := '{}';
  v_mostr   uuid := public.inventario_mostrador();
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
                (i.id = v_mostr) DESC, i.created_at
       LIMIT 1;
    END IF;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'producto no encontrado: %', coalesce(v_item->>'product_id', v_item->>'sku');
    END IF;

    -- This almacén's live quote, or a new one.
    v_id := public.cotizacion_wa_viva(p_telefono, v_p.inventory_id);
    IF v_id IS NULL THEN
      INSERT INTO public.cotizaciones
        (folio, vendedor_id, estado, canal, customer_id, notas, created_by, expires_at, inventory_id)
      VALUES
        ('COT-' || to_char(nextval('public.cotizacion_seq'), 'FM000000'), NULL, 'pendiente', 'whatsapp',
         v_cust_id, 'WhatsApp: ' || p_telefono, 'agente_whatsapp', now() + interval '7 days',
         v_p.inventory_id)
      RETURNING cotizaciones.id INTO v_id;
      v_nuevas := v_nuevas || v_id;
    ELSIF v_cust_id IS NOT NULL THEN
      UPDATE public.cotizaciones SET customer_id = v_cust_id
       WHERE cotizaciones.id = v_id AND customer_id IS NULL;
    END IF;
    IF NOT (v_id = ANY (v_tocadas)) THEN v_tocadas := v_tocadas || v_id; END IF;

    IF v_item->>'entrega' IN ('ruta', 'expres') THEN
      UPDATE public.cotizaciones c
         SET entrega = v_item->>'entrega',
             entrega_fecha = nullif(v_item->>'fecha', '')::date,
             pedir_antes = nullif(v_item->>'corte', '')::timestamptz,
             cargo_expres_cents = CASE WHEN v_item->>'entrega' = 'expres'
               THEN (SELECT i.expres_costo_cents FROM public.inventories i WHERE i.id = v_p.inventory_id)
               ELSE 0 END
       WHERE c.id = v_id;
    END IF;

    IF NOT (v_p.sku = ANY (v_limpias)) THEN
      DELETE FROM public.cotizacion_items ci
       WHERE ci.sku = v_p.sku
         AND ci.cotizacion_id IN (SELECT public.cotizaciones_wa_vivas(p_telefono));
      v_limpias := v_limpias || v_p.sku;
    END IF;

    v_unit := CASE
      WHEN v_desc > 0 THEN round(v_p.price_cents * (100 - v_desc) / 100.0)::int
      ELSE v_p.price_cents
    END;
    INSERT INTO public.cotizacion_items
      (cotizacion_id, product_id, nombre, sku, qty, unit_price_cents, cost_cents, line_total_cents)
    VALUES (v_id, v_p.id, v_p.name, v_p.sku, v_qty, v_unit, v_p.cost_cents, v_unit * v_qty);
  END LOOP;

  -- Every live quote: a SKU moved out of one leaves its total to redo.
  RETURN QUERY
    SELECT c.id, c.folio, c.share_token, public.recalcular_cotizacion(c.id),
           c.id = ANY (v_nuevas), coalesce(c.inventory_id, v_mostr), i.name
      FROM public.cotizaciones c
      LEFT JOIN public.inventories i ON i.id = coalesce(c.inventory_id, v_mostr)
     WHERE c.id IN (SELECT public.cotizaciones_wa_vivas(p_telefono))
     ORDER BY (coalesce(c.inventory_id, v_mostr) = v_mostr) DESC, c.created_at;
END;
$function$;

-- Remove from every live quote of the conversation.
CREATE OR REPLACE FUNCTION public.quitar_de_cotizacion_whatsapp(p_telefono text, p_sku text DEFAULT NULL::text, p_todo boolean DEFAULT false)
 RETURNS TABLE(id uuid, folio text, share_token uuid, total_cents integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(coalesce(p_telefono, '')));
  IF p_todo THEN
    DELETE FROM public.cotizacion_items ci
     WHERE ci.cotizacion_id IN (SELECT public.cotizaciones_wa_vivas(p_telefono));
  ELSIF p_sku IS NOT NULL THEN
    DELETE FROM public.cotizacion_items ci
     WHERE ci.sku = p_sku
       AND ci.cotizacion_id IN (SELECT public.cotizaciones_wa_vivas(p_telefono));
  END IF;
  RETURN QUERY
    SELECT c.id, c.folio, c.share_token, public.recalcular_cotizacion(c.id)
      FROM public.cotizaciones c
     WHERE c.id IN (SELECT public.cotizaciones_wa_vivas(p_telefono))
     ORDER BY c.created_at;
END;
$function$;

-- Paying a quote: its exprés charge goes on the order's envío.
CREATE OR REPLACE FUNCTION public.crear_orden_desde_cotizacion(p_token text, p_nombre text, p_email text, p_telefono text, p_cp text, p_estado text, p_municipio text, p_direccion text, p_referencias text, p_envio_cents integer, p_envio_desc text, p_tipo_entrega text)
 RETURNS TABLE(orden_id uuid, folio text, total_cents integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
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
  v_envio    int;
  v_desc     text;
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
  -- Exprés from another almacén is shipping too: it rides on the envío, also
  -- when the customer picks the order up.
  v_envio := (CASE WHEN v_recoger THEN 0 ELSE p_envio_cents END) + coalesce(v_c.cargo_expres_cents, 0);
  v_desc := concat_ws(' + ',
    CASE WHEN v_recoger THEN 'Recoger en tienda' ELSE p_envio_desc END,
    CASE WHEN coalesce(v_c.cargo_expres_cents, 0) > 0 THEN 'Servicio exprés' END);

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
    v_envio,
    v_desc,
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
         total_cents = v_subtotal + v_envio
   WHERE id = v_id;

  -- Paying IS authorizing: a quote that reaches checkout skips the button.
  IF v_c.estado = 'pendiente' THEN
    UPDATE public.cotizaciones
       SET estado = 'autorizada', autorizada_at = now()
     WHERE id = v_c.id;
  END IF;

  RETURN QUERY SELECT v_id, v_folio,
    v_subtotal + v_envio;
END;
$function$;
