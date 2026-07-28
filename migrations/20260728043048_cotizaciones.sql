-- Cotización como objeto.
--
-- A quote is a customer's requested items + prices as a first-class entity with
-- its own lifecycle, owner (assigned vendedor) and folio — not a loose chat nor
-- an instant sale. Lifecycle:
--   borrador  (armando, no enviada)
--   pendiente (enviada; editable — el cliente pide cambios)
--   autorizada (aceptada; ventana de surtido + envío, manual en MVP)
--   convertida (entregada → se creó la venta)  [terminal]
--   cancelada  (rechazada / vencida / anulada)  [terminal]
--
-- Prices are SNAPSHOT at creation, so within its vigencia the quote honors the
-- quoted price even if the catalog moves. No stock is touched until conversion
-- (a quote isn't a commitment); convert decrements at that moment and creates
-- the sale honoring the quoted line prices.

CREATE SEQUENCE IF NOT EXISTS public.cotizacion_seq START 1;

CREATE TABLE IF NOT EXISTS public.cotizaciones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio          text NOT NULL UNIQUE,
  customer_id    uuid REFERENCES public.customers(id),
  vendedor_id    text,                       -- assigned Clerk user id (nullable)
  estado         text NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('borrador','pendiente','autorizada','convertida','cancelada')),
  canal          text NOT NULL DEFAULT 'mostrador'
                   CHECK (canal IN ('mostrador','whatsapp','web')),
  subtotal_cents int NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  total_cents    int NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  notas          text,
  expires_at     timestamptz,
  created_by     text NOT NULL,
  autorizada_at  timestamptz,
  sale_id        uuid REFERENCES public.sales(id),
  cancel_motivo  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cotizaciones_estado_idx ON public.cotizaciones (estado);
CREATE INDEX IF NOT EXISTS cotizaciones_vendedor_idx ON public.cotizaciones (vendedor_id);
CREATE INDEX IF NOT EXISTS cotizaciones_created_by_idx ON public.cotizaciones (created_by);

CREATE TABLE IF NOT EXISTS public.cotizacion_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id    uuid NOT NULL REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  product_id       uuid REFERENCES public.products(id),
  nombre           text NOT NULL,          -- snapshot
  sku              text,                   -- snapshot
  qty              int NOT NULL CHECK (qty > 0),
  unit_price_cents int NOT NULL,           -- snapshot: quoted price
  cost_cents       int NOT NULL DEFAULT 0, -- snapshot: for margin (admin)
  line_total_cents int NOT NULL
);
CREATE INDEX IF NOT EXISTS cotizacion_items_cot_idx ON public.cotizacion_items (cotizacion_id);

ALTER TABLE public.cotizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizacion_items ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- crear_cotizacion — snapshot prices, assign a folio, NO stock movement.
-- p_estado is 'borrador' or 'pendiente'.
-- ============================================================
CREATE OR REPLACE FUNCTION public.crear_cotizacion(
  p_items        jsonb,   -- [{product_id, qty}]
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
    v_folio, p_customer_id, NULLIF(btrim(coalesce(p_vendedor_id, '')), ''), p_estado,
    COALESCE(p_canal, 'mostrador'), NULLIF(btrim(coalesce(p_notas, '')), ''), v_uid,
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

-- ============================================================
-- convertir_cotizacion — accepted quote → sale, at delivery. Honors the QUOTED
-- prices (not the current catalog), decrements stock, links sale_id.
-- ============================================================
CREATE OR REPLACE FUNCTION public.convertir_cotizacion(
  p_id     uuid,
  p_metodo text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_c       public.cotizaciones%ROWTYPE;
  v_sale_id uuid;
  v_cust    text;
  v_item    record;
  v_prod    public.products%ROWTYPE;
BEGIN
  SELECT * INTO v_c FROM public.cotizaciones WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cotización no encontrada'; END IF;
  IF v_c.estado = 'convertida' THEN RETURN v_c.sale_id; END IF;   -- idempotent
  IF v_c.estado <> 'autorizada' THEN RAISE EXCEPTION 'la cotización no está autorizada'; END IF;

  IF v_c.customer_id IS NOT NULL THEN
    SELECT nombre INTO v_cust FROM public.customers WHERE id = v_c.customer_id;
  END IF;

  INSERT INTO public.sales (payment_method, customer_name, customer_id, sold_by, total_cents, canal, note)
  VALUES (p_metodo, v_cust, v_c.customer_id, COALESCE(v_c.vendedor_id, v_c.created_by),
          v_c.total_cents, 'mostrador', 'Cotización ' || v_c.folio)
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT product_id, nombre, sku, qty, unit_price_cents
                FROM public.cotizacion_items WHERE cotizacion_id = p_id
  LOOP
    IF v_item.product_id IS NOT NULL THEN
      SELECT * INTO v_prod FROM public.products WHERE id = v_item.product_id FOR UPDATE;
      IF FOUND THEN
        IF v_prod.quantity < v_item.qty THEN
          RAISE EXCEPTION 'Sin stock suficiente de %', v_prod.name USING errcode = '23514';
        END IF;
        INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
        VALUES (v_item.product_id, -v_item.qty, 'sale', v_sale_id, COALESCE(v_c.vendedor_id, v_c.created_by));
      END IF;
    END IF;

    INSERT INTO public.sale_items (sale_id, product_id, qty, unit_price_cents, line_total_cents)
    VALUES (v_sale_id, v_item.product_id, v_item.qty, v_item.unit_price_cents, v_item.unit_price_cents * v_item.qty);
  END LOOP;

  UPDATE public.cotizaciones
     SET estado = 'convertida', sale_id = v_sale_id, updated_at = now()
   WHERE id = p_id;

  RETURN v_sale_id;
END;
$$;
