-- Local pickup + direct-transfer for web orders.
--
-- Two new realities the storefront must model:
--   1. tipo_entrega = 'recoger': local customer arranges their own courier (an
--      Uber to the store). No shipping quote, no address — but they still pay,
--      and the piece is only released once the order is 'pagada'. That paid gate
--      is the whole security story: never hand product to a courier unverified.
--   2. metodo = 'transferencia': a direct bank transfer OUTSIDE Conekta. The
--      order reserves stock and sits 'pendiente' with no conekta_order_id until
--      an admin confirms the deposit landed — distinct from a Conekta-pending
--      order, which carries a conekta_order_id and self-confirms via webhook.

ALTER TABLE public.ordenes_web
  ADD COLUMN IF NOT EXISTS tipo_entrega text NOT NULL DEFAULT 'envio';

DO $$ BEGIN
  ALTER TABLE public.ordenes_web ADD CONSTRAINT ordenes_web_tipo_entrega_chk
    CHECK (tipo_entrega IN ('envio', 'recoger'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Pickup has no address. Relax the NOT NULLs, then require the address only when
-- it's actually a shipment.
ALTER TABLE public.ordenes_web
  ALTER COLUMN cp DROP NOT NULL,
  ALTER COLUMN estado DROP NOT NULL,
  ALTER COLUMN municipio DROP NOT NULL,
  ALTER COLUMN direccion DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.ordenes_web ADD CONSTRAINT ordenes_web_direccion_si_envio_chk
    CHECK (
      tipo_entrega <> 'envio'
      OR (cp IS NOT NULL AND estado IS NOT NULL AND municipio IS NOT NULL AND direccion IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add 'transferencia' (direct bank transfer, confirmed by an admin).
ALTER TABLE public.ordenes_web DROP CONSTRAINT IF EXISTS ordenes_web_metodo_check;
ALTER TABLE public.ordenes_web ADD CONSTRAINT ordenes_web_metodo_check
  CHECK (metodo IN ('card', 'oxxo', 'spei', 'aplazo', 'transferencia'));

-- ============================================================
-- crear_orden_web — now takes p_tipo_entrega. Skips the CP/address checks for a
-- pickup; still reserves stock exactly the same way.
-- ============================================================
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
  p_envio_desc  text,
  p_tipo_entrega text
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
  v_recoger  boolean := (p_tipo_entrega = 'recoger');
BEGIN
  IF p_tipo_entrega NOT IN ('envio', 'recoger') THEN
    RAISE EXCEPTION 'tipo de entrega inválido';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'carrito vacío';
  END IF;
  IF coalesce(btrim(p_nombre), '') = '' OR coalesce(btrim(p_email), '') = ''
     OR coalesce(btrim(p_telefono), '') = '' THEN
    RAISE EXCEPTION 'faltan datos del cliente';
  END IF;
  -- Address + shipping only matter for a shipment. Pickup rides with zero envío.
  IF NOT v_recoger THEN
    IF p_cp !~ '^\d{5}$' THEN RAISE EXCEPTION 'código postal inválido'; END IF;
    IF p_envio_cents IS NULL OR p_envio_cents < 0 THEN RAISE EXCEPTION 'envío inválido'; END IF;
  END IF;

  v_folio := 'LD-' || to_char(nextval('public.orden_web_seq'), 'FM000000');

  INSERT INTO public.ordenes_web (
    folio, nombre, email, telefono, cp, estado, municipio, direccion, referencias,
    envio_cents, envio_desc, subtotal_cents, total_cents, tipo_entrega
  ) VALUES (
    v_folio, btrim(p_nombre), btrim(p_email), btrim(p_telefono),
    CASE WHEN v_recoger THEN NULL ELSE p_cp END,
    CASE WHEN v_recoger THEN NULL ELSE p_estado END,
    CASE WHEN v_recoger THEN NULL ELSE p_municipio END,
    CASE WHEN v_recoger THEN NULL ELSE p_direccion END,
    NULLIF(btrim(coalesce(p_referencias, '')), ''),
    CASE WHEN v_recoger THEN 0 ELSE p_envio_cents END,
    CASE WHEN v_recoger THEN 'Recoger en tienda' ELSE p_envio_desc END,
    0, 0, p_tipo_entrega
  ) RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'qty')::int;
    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'cantidad inválida'; END IF;

    SELECT * INTO v_prod FROM public.products
    WHERE id = (v_item->>'product_id')::uuid AND is_active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'producto no disponible'; END IF;
    IF v_prod.quantity < v_qty THEN
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
     SET subtotal_cents = v_subtotal,
         total_cents = v_subtotal + (CASE WHEN v_recoger THEN 0 ELSE p_envio_cents END)
   WHERE id = v_id;

  RETURN QUERY SELECT v_id, v_folio, v_subtotal,
    v_subtotal + (CASE WHEN v_recoger THEN 0 ELSE p_envio_cents END);
END;
$$;

-- The old 11-arg version is now ambiguous dead weight — drop it so every caller
-- goes through the tipo_entrega one.
DROP FUNCTION IF EXISTS public.crear_orden_web(jsonb, text, text, text, text, text, text, text, text, int, text);
REVOKE EXECUTE ON FUNCTION public.crear_orden_web(jsonb, text, text, text, text, text, text, text, text, int, text, text) FROM PUBLIC;

-- ============================================================
-- pagar_orden_web — map the new 'transferencia' method to itself so an
-- admin-confirmed direct transfer lands in "Transferencia", not "Otro".
-- (Full body re-declared; only the CASE changed.)
-- ============================================================
CREATE OR REPLACE FUNCTION public.pagar_orden_web(
  p_orden_id  uuid,
  p_conekta_id text,
  p_metodo    text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_o       public.ordenes_web%ROWTYPE;
  v_sale_id uuid;
  v_pm      text;
  v_item    record;
BEGIN
  SELECT * INTO v_o FROM public.ordenes_web WHERE id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'orden no encontrada'; END IF;
  IF v_o.status = 'pagada' THEN RETURN v_o.sale_id; END IF;
  IF v_o.status = 'cancelada' THEN RAISE EXCEPTION 'orden cancelada'; END IF;

  v_pm := CASE p_metodo
            WHEN 'card' THEN 'tarjeta'
            WHEN 'spei' THEN 'transferencia'
            WHEN 'transferencia' THEN 'transferencia'
            ELSE 'otro'          -- oxxo, aplazo
          END;

  INSERT INTO public.sales (status, payment_method, customer_name, sold_by,
                            total_cents, canal, note)
  VALUES ('completed', v_pm, v_o.nombre, 'online', v_o.subtotal_cents, 'online',
          'Orden ' || v_o.folio)
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT product_id, qty, unit_price_cents FROM public.orden_web_items
                WHERE orden_id = p_orden_id
  LOOP
    INSERT INTO public.sale_items (sale_id, product_id, qty, unit_price_cents, line_total_cents)
    VALUES (v_sale_id, v_item.product_id, v_item.qty, v_item.unit_price_cents,
            v_item.unit_price_cents * v_item.qty);
  END LOOP;

  UPDATE public.ordenes_web
     SET status = 'pagada', paid_at = now(), sale_id = v_sale_id,
         metodo = coalesce(p_metodo, metodo),
         conekta_order_id = coalesce(p_conekta_id, conekta_order_id)
   WHERE id = p_orden_id;

  RETURN v_sale_id;
END;
$$;
