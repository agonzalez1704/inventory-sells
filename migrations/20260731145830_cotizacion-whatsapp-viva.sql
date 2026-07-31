-- The WhatsApp quote becomes a LIVING order: created as soon as the agent
-- quotes concrete products (link shared in that same message) and edited in
-- place as the conversation evolves — same folio, same share link. The seller
-- broadcast moves out of creation (it now fires when the customer closes the
-- order or authorizes) so price-shopping doesn't ping the whole team.

-- Replace the current item set of a live WhatsApp quote. Empty items allowed
-- (customer removed everything — totals go to 0, link stays alive).
CREATE OR REPLACE FUNCTION public.actualizar_cotizacion_whatsapp(
  p_id    uuid,
  p_items jsonb   -- [{sku, qty}]
)
RETURNS TABLE (id uuid, folio text, share_token uuid, total_cents int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_cot   public.cotizaciones%ROWTYPE;
  v_item  jsonb;
  v_p     public.products%ROWTYPE;
  v_qty   int;
  v_unit  int;
  v_sub   int := 0;
  v_desc  numeric := 0;
BEGIN
  SELECT * INTO v_cot FROM public.cotizaciones c
   WHERE c.id = p_id AND c.canal = 'whatsapp' AND c.estado = 'pendiente';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cotización no editable';
  END IF;

  -- Registered customer's CURRENT standing discount (same as creation).
  IF v_cot.customer_id IS NOT NULL THEN
    SELECT c.descuento_pct INTO v_desc FROM public.customers c WHERE c.id = v_cot.customer_id;
    v_desc := coalesce(v_desc, 0);
  END IF;

  DELETE FROM public.cotizacion_items WHERE cotizacion_id = p_id;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
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
      VALUES (p_id, v_p.id, v_p.name, v_p.sku, v_qty, v_unit, v_p.cost_cents, v_unit * v_qty);

      v_sub := v_sub + v_unit * v_qty;
    END LOOP;
  END IF;

  UPDATE public.cotizaciones
     SET subtotal_cents = v_sub, total_cents = v_sub
   WHERE cotizaciones.id = p_id;

  RETURN QUERY
    SELECT c.id, c.folio, c.share_token, v_sub
      FROM public.cotizaciones c WHERE c.id = p_id;
END;
$$;

-- The per-number draft now carries its live quote's identity so every
-- mutation edits the same cotización and the bot can re-share the same link.
ALTER TABLE public.wa_pedidos
  ADD COLUMN cotizacion_id uuid,
  ADD COLUMN folio         text,
  ADD COLUMN share_token   uuid;
