-- "Apartado" — the customer who picks up in person reserves without paying.
--
-- Decided with the user: paying online is for a shipment, or for a pickup where
-- somebody else collects (an Uber driver carries only the folio, so that order
-- must already be paid). Whoever comes in person pays at the counter, and the
-- sale is registered there by staff. What the storefront does is hold the
-- pieces for a while.
--
-- How long: by coverage, i.e. how many days the stock lasts at the pace it
-- actually sells (last 30 days of completed sales).
--   last piece, or coverage <= 30 days   -> 1 h   (scarce: cannot sit all day)
--   coverage <= 60 days                  -> 2 h
--   coverage <= 90 days                  -> 3 h
--   more, or never sold                  -> until closing (20:00 CDMX)
-- A multi-item order takes the SHORTEST of its lines: the hold is only as good
-- as its scarcest piece.
--
-- Stock is reserved exactly as any other web order (crear_orden_web), so an
-- expired hold releases it with the same 'return' movement. Nothing here
-- touches money: the sale exists only once someone charges it at the counter.

ALTER TABLE public.ordenes_web
  ADD COLUMN IF NOT EXISTS apartada_hasta timestamptz,
  -- Which branch the customer chose to collect at, by name (the branches live
  -- in config_negocio's jsonb, not in a table of their own).
  ADD COLUMN IF NOT EXISTS sucursal text;

-- 'sucursal' = will pay at the counter; it is not a Conekta method and never
-- reaches the bank on its own. When staff charges it, the method becomes what
-- they actually took: 'efectivo' (into the cash box, so the corte sees it) or
-- 'tarjeta'.
ALTER TABLE public.ordenes_web DROP CONSTRAINT IF EXISTS ordenes_web_metodo_check;
ALTER TABLE public.ordenes_web ADD CONSTRAINT ordenes_web_metodo_check
  CHECK (metodo IN ('card', 'oxxo', 'spei', 'aplazo', 'transferencia', 'sucursal',
                    'efectivo', 'tarjeta'));

-- An expired hold is not a cancellation: nobody changed their mind, the clock
-- ran out. Staff sees the difference, and so do the reports.
ALTER TABLE public.ordenes_web DROP CONSTRAINT IF EXISTS ordenes_web_status_check;
ALTER TABLE public.ordenes_web ADD CONSTRAINT ordenes_web_status_check
  CHECK (status IN ('pendiente', 'pagada', 'cancelada', 'expirada'));

-- The sweep reads exactly this.
CREATE INDEX IF NOT EXISTS ordenes_web_apartadas_idx
  ON public.ordenes_web (apartada_hasta)
  WHERE status = 'pendiente' AND metodo = 'sucursal';

-- ============================================================
-- horas_apartado — the window for a cart, in hours.
-- ============================================================
CREATE OR REPLACE FUNCTION public.horas_apartado(p_items jsonb)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH pedidos AS (
    SELECT (x->>'product_id')::uuid AS product_id
      FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
  ),
  vendidas AS (
    SELECT si.product_id, sum(si.qty) AS piezas
      FROM public.sale_items si
      JOIN public.sales s ON s.id = si.sale_id
       AND s.status = 'completed'
       AND s.created_at >= now() - interval '30 days'
     WHERE si.product_id IN (SELECT product_id FROM pedidos)
     GROUP BY si.product_id
  ),
  -- Hours left until closing, never less than one: a hold granted at 19:50
  -- would otherwise be over before the customer crosses the street.
  cierre AS (
    SELECT greatest(
      1,
      extract(epoch FROM (
        date_trunc('day', now() AT TIME ZONE 'America/Mexico_City')
          + interval '20 hours' - (now() AT TIME ZONE 'America/Mexico_City')
      )) / 3600
    )::numeric AS horas
  ),
  por_pieza AS (
    SELECT CASE
             WHEN p.quantity <= 1 THEN 1
             WHEN coalesce(v.piezas, 0) = 0 THEN (SELECT horas FROM cierre)
             -- Coverage in days: stock ÷ pieces sold per day.
             WHEN p.quantity / (v.piezas / 30.0) <= 30 THEN 1
             WHEN p.quantity / (v.piezas / 30.0) <= 60 THEN 2
             WHEN p.quantity / (v.piezas / 30.0) <= 90 THEN 3
             ELSE (SELECT horas FROM cierre)
           END AS horas
      FROM pedidos i
      JOIN public.products p ON p.id = i.product_id
      LEFT JOIN vendidas v ON v.product_id = i.product_id
  )
  -- The scarcest piece sets the window; an empty cart never gets here.
  SELECT coalesce(min(horas), 1) FROM por_pieza;
$$;

-- ============================================================
-- apartar_orden_web — a pickup order that reserves without paying.
-- Reuses crear_orden_web so the stock rules live in ONE place.
-- ============================================================
CREATE OR REPLACE FUNCTION public.apartar_orden_web(
  p_items     jsonb,
  p_nombre    text,
  p_email     text,
  p_telefono  text,
  p_sucursal  text
)
RETURNS TABLE (orden_id uuid, folio text, total_cents int, apartada_hasta timestamptz, horas numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_row   record;
  v_horas numeric;
  v_hasta timestamptz;
BEGIN
  -- Free whatever expired before taking new pieces: the customer in front of
  -- us must see the stock a lapsed hold was sitting on.
  PERFORM public.liberar_apartados_vencidos();

  SELECT * INTO v_row FROM public.crear_orden_web(
    p_items, p_nombre, p_email, p_telefono,
    NULL, NULL, NULL, NULL, NULL, 0, 'Recoger en sucursal', 'recoger'
  );

  v_horas := public.horas_apartado(p_items);
  v_hasta := now() + make_interval(mins => round(v_horas * 60)::int);

  UPDATE public.ordenes_web
     SET metodo = 'sucursal',
         apartada_hasta = v_hasta,
         sucursal = NULLIF(btrim(coalesce(p_sucursal, '')), '')
   WHERE id = v_row.orden_id;

  RETURN QUERY SELECT v_row.orden_id, v_row.folio, v_row.total_cents, v_hasta, v_horas;
END;
$$;

-- ============================================================
-- liberar_apartados_vencidos — returns how many holds it released.
-- Idempotent and safe to call from anywhere (the cron, and every new hold).
-- ============================================================
CREATE OR REPLACE FUNCTION public.liberar_apartados_vencidos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_id  uuid;
  v_n   integer := 0;
BEGIN
  FOR v_id IN
    SELECT id FROM public.ordenes_web
     WHERE status = 'pendiente' AND metodo = 'sucursal'
       AND apartada_hasta IS NOT NULL AND apartada_hasta < now()
     ORDER BY apartada_hasta
     LIMIT 200
  LOOP
    -- Same release path as any cancellation: 'return' movements, then the
    -- status says it was the clock, not the customer.
    PERFORM public.cancelar_orden_web(v_id);
    UPDATE public.ordenes_web SET status = 'expirada' WHERE id = v_id AND status = 'cancelada';
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

-- ============================================================
-- pagar_orden_web — a hold charged at the counter lands as what the customer
-- actually paid with: cash goes into the box (so the corte sees it), card to
-- the bank. Only the CASE changed; the rest is the deployed body.
-- ============================================================
CREATE OR REPLACE FUNCTION public.pagar_orden_web(p_orden_id uuid, p_conekta_id text, p_metodo text)
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
  v_drop    boolean;
BEGIN
  SELECT * INTO v_o FROM public.ordenes_web WHERE id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'orden no encontrada'; END IF;
  IF v_o.status = 'pagada' THEN RETURN v_o.sale_id; END IF;
  IF v_o.status IN ('cancelada', 'expirada') THEN RAISE EXCEPTION 'orden cancelada'; END IF;

  v_pm := CASE p_metodo
            WHEN 'card' THEN 'tarjeta'
            WHEN 'tarjeta' THEN 'tarjeta'
            WHEN 'spei' THEN 'transferencia'
            WHEN 'transferencia' THEN 'transferencia'
            WHEN 'efectivo' THEN 'efectivo'
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

  SELECT EXISTS (
    SELECT 1 FROM public.orden_web_items owi
    JOIN public.products p ON p.id = owi.product_id
    JOIN public.inventories i ON i.id = p.inventory_id AND i.es_dropship
    WHERE owi.orden_id = p_orden_id
  ) INTO v_drop;

  UPDATE public.ordenes_web
     SET status = 'pagada', paid_at = now(), sale_id = v_sale_id,
         metodo = coalesce(p_metodo, metodo),
         conekta_order_id = coalesce(p_conekta_id, conekta_order_id),
         dropship_estado = CASE WHEN v_drop THEN 'por_pedir' ELSE dropship_estado END
   WHERE id = p_orden_id;

  RETURN v_sale_id;
END;
$$;

-- Storefront writes go through server actions on the admin client.
REVOKE EXECUTE ON FUNCTION public.apartar_orden_web(jsonb, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.liberar_apartados_vencidos() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.horas_apartado(jsonb) FROM PUBLIC;
