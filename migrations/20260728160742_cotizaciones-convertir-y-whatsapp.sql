-- Split "mark the sale" from "authorize", and support the WhatsApp agent as the
-- primary cotizador.
--
-- 1) cotizaciones_convertir — a HIGHER-level permission (encargado/dueño, NOT a
--    plain vendedor) required to convert an authorized quote into a sale. An
--    authorized quote is not a sale until someone with this permission marks it.
--    `autorizar` stays a vendedor-level step (customer accepted the quote).
-- 2) crear_cotizacion — a vendedor creating a quote owns it (auto-assign to
--    creator), EXCEPT when it comes from the WhatsApp agent (canal='whatsapp'):
--    those are left UNASSIGNED so any vendedor/encargado can claim them.

-- Grant the new permiso to the roles that already carry the reins.
INSERT INTO public.role_permissions (role_id, permiso)
SELECT id, 'cotizaciones_convertir' FROM public.roles WHERE slug IN ('dueno', 'encargado')
ON CONFLICT DO NOTHING;

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
  v_uid      text := public.requesting_user_id();
  v_canal    text := COALESCE(p_canal, 'mostrador');
  v_explicit text := NULLIF(btrim(coalesce(p_vendedor_id, '')), '');
  v_vendedor text;
  v_id       uuid;
  v_folio    text;
  v_item     jsonb;
  v_p        public.products%ROWTYPE;
  v_qty      int;
  v_sub      int := 0;
  v_dias     int := COALESCE(NULLIF(p_vigencia_dias, 0), 7);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no autenticado' USING errcode = '28000'; END IF;
  IF p_estado NOT IN ('borrador','pendiente') THEN RAISE EXCEPTION 'estado inicial inválido'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'cotización sin productos';
  END IF;

  -- Explicit assignee wins; else the human creator owns it; a WhatsApp-agent
  -- quote stays unassigned so someone can claim it.
  v_vendedor := COALESCE(v_explicit, CASE WHEN v_canal = 'whatsapp' THEN NULL ELSE v_uid END);

  v_folio := 'COT-' || to_char(nextval('public.cotizacion_seq'), 'FM000000');

  INSERT INTO public.cotizaciones (folio, customer_id, vendedor_id, estado, canal, notas, created_by, expires_at)
  VALUES (v_folio, p_customer_id, v_vendedor, p_estado, v_canal,
          NULLIF(btrim(coalesce(p_notas, '')), ''), v_uid, now() + (v_dias || ' days')::interval)
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
