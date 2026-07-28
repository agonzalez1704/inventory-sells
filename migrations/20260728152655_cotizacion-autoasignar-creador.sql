-- Auto-assign the creator when no vendedor is passed.
--
-- Business rule: if a vendedor makes the quote directly it's automatically
-- theirs. More generally, a quote is never orphaned — whoever creates it owns it
-- unless an explicit assignee (admin/encargado picking a seller) is given. Only
-- the vendedor_id default changes vs the original crear_cotizacion.

CREATE OR REPLACE FUNCTION public.crear_cotizacion(
  p_items        jsonb,
  p_customer_id  uuid,
  p_canal        text,
  p_vendedor_id  text,
  p_vigencia_dias int,
  p_notas        text,
  p_estado       text
)
RETURNS TABLE (id uuid, folio text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid   text := public.requesting_user_id();
  v_id    uuid;
  v_folio text;
  v_item  jsonb;
  v_p     public.products%ROWTYPE;
  v_qty   int;
  v_sub   int := 0;
  v_dias  int := COALESCE(NULLIF(p_vigencia_dias, 0), 7);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no autenticado' USING errcode = '28000'; END IF;
  IF p_estado NOT IN ('borrador','pendiente') THEN RAISE EXCEPTION 'estado inicial inválido'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'cotización sin productos';
  END IF;

  v_folio := 'COT-' || to_char(nextval('public.cotizacion_seq'), 'FM000000');

  INSERT INTO public.cotizaciones (folio, customer_id, vendedor_id, estado, canal, notas, created_by, expires_at)
  VALUES (
    v_folio, p_customer_id,
    -- explicit assignee if given, else the creator owns it
    COALESCE(NULLIF(btrim(coalesce(p_vendedor_id, '')), ''), v_uid),
    p_estado, COALESCE(p_canal, 'mostrador'), NULLIF(btrim(coalesce(p_notas, '')), ''), v_uid,
    now() + (v_dias || ' days')::interval
  )
  RETURNING cotizaciones.id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'qty')::int;
    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'cantidad inválida'; END IF;
    SELECT * INTO v_p FROM public.products WHERE products.id = (v_item->>'product_id')::uuid AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'producto no disponible'; END IF;

    INSERT INTO public.cotizacion_items
      (cotizacion_id, product_id, nombre, sku, qty, unit_price_cents, cost_cents, line_total_cents)
    VALUES (v_id, v_p.id, v_p.name, v_p.sku, v_qty, v_p.price_cents, v_p.cost_cents, v_p.price_cents * v_qty);

    v_sub := v_sub + v_p.price_cents * v_qty;
  END LOOP;

  UPDATE public.cotizaciones SET subtotal_cents = v_sub, total_cents = v_sub WHERE cotizaciones.id = v_id;
  RETURN QUERY SELECT v_id, v_folio;
END;
$$;
