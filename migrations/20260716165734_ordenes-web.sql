-- Web orders for the public storefront (Conekta-paid), and their conversion into
-- a normal sale so stock, corte and reports stay in one ledger.
--
-- Stock model mirrors `adelantos`, NOT the shoe-store's commit-on-pay:
--   crear_orden_web  -> 'reserva' -qty  (stock leaves NOW; the POS can't oversell
--                       it while an OXXO voucher sits unpaid for days)
--   pagar_orden_web  -> creates the sale, NO new movement (the reserva already
--                       decremented; a 'sale' movement here would double-count)
--   cancelar_orden_web -> 'return' +qty releases it
--
-- Payment mapping matters for the corte: OXXO/SPEI/card money lands in the bank
-- via Conekta, NEVER in the physical cash box, so nothing here maps to
-- 'efectivo' — that would corrupt "Efectivo en caja".

-- Where a sale came from. Existing rows are counter sales.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'mostrador';
DO $$ BEGIN
  ALTER TABLE public.sales ADD CONSTRAINT sales_canal_chk
    CHECK (canal IN ('mostrador', 'online'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS sales_canal_idx ON public.sales (canal);

CREATE SEQUENCE IF NOT EXISTS public.orden_web_seq START 1000;

CREATE TABLE IF NOT EXISTS public.ordenes_web (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio             text NOT NULL UNIQUE,
  -- customer (guest checkout — no account needed)
  nombre            text NOT NULL,
  email             text NOT NULL,
  telefono          text NOT NULL,
  -- shipping
  cp                text NOT NULL,
  estado            text NOT NULL,
  municipio         text NOT NULL,
  direccion         text NOT NULL,
  referencias       text,
  envio_desc        text,               -- e.g. "Estafeta Terrestre · 2 días"
  envio_cents       int  NOT NULL DEFAULT 0 CHECK (envio_cents >= 0),
  subtotal_cents    int  NOT NULL CHECK (subtotal_cents >= 0),
  total_cents       int  NOT NULL CHECK (total_cents >= 0),
  -- payment
  metodo            text CHECK (metodo IN ('card', 'oxxo', 'spei', 'aplazo')),
  conekta_order_id  text UNIQUE,
  status            text NOT NULL DEFAULT 'pendiente'
                      CHECK (status IN ('pendiente', 'pagada', 'cancelada')),
  sale_id           uuid REFERENCES public.sales(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  paid_at           timestamptz
);
CREATE INDEX IF NOT EXISTS ordenes_web_status_idx  ON public.ordenes_web (status);
CREATE INDEX IF NOT EXISTS ordenes_web_created_idx ON public.ordenes_web (created_at);

CREATE TABLE IF NOT EXISTS public.orden_web_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id         uuid NOT NULL REFERENCES public.ordenes_web(id) ON DELETE CASCADE,
  product_id       uuid NOT NULL REFERENCES public.products(id),
  nombre           text NOT NULL,        -- snapshot: the catalog may change later
  qty              int  NOT NULL CHECK (qty > 0),
  unit_price_cents int  NOT NULL CHECK (unit_price_cents >= 0)
);
CREATE INDEX IF NOT EXISTS orden_web_items_orden_idx ON public.orden_web_items (orden_id);

ALTER TABLE public.ordenes_web     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orden_web_items ENABLE ROW LEVEL SECURITY;
-- Staff can read orders in the app; the storefront never reads them with the
-- anon key (server actions use the admin client), so no anon policy exists.
CREATE POLICY "authenticated read ordenes_web"
  ON public.ordenes_web FOR SELECT TO authenticated
  USING (public.requesting_user_id() IS NOT NULL);
CREATE POLICY "authenticated read orden_web_items"
  ON public.orden_web_items FOR SELECT TO authenticated
  USING (public.requesting_user_id() IS NOT NULL);
GRANT SELECT ON public.ordenes_web     TO authenticated;
GRANT SELECT ON public.orden_web_items TO authenticated;

-- ============================================================
-- crear_orden_web — validates stock, RESERVES it, records the order.
-- Prices come from the catalog, never from the client.
-- ============================================================
CREATE OR REPLACE FUNCTION public.crear_orden_web(
  p_items       jsonb,   -- [{product_id, qty}]
  p_nombre      text,
  p_email       text,
  p_telefono    text,
  p_cp          text,
  p_estado      text,
  p_municipio   text,
  p_direccion   text,
  p_referencias text,
  p_envio_cents int,
  p_envio_desc  text
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
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'carrito vacío';
  END IF;
  IF coalesce(btrim(p_nombre), '') = '' OR coalesce(btrim(p_email), '') = ''
     OR coalesce(btrim(p_telefono), '') = '' THEN
    RAISE EXCEPTION 'faltan datos del cliente';
  END IF;
  IF p_cp !~ '^\d{5}$' THEN RAISE EXCEPTION 'código postal inválido'; END IF;
  IF p_envio_cents IS NULL OR p_envio_cents < 0 THEN RAISE EXCEPTION 'envío inválido'; END IF;

  v_folio := 'LD-' || to_char(nextval('public.orden_web_seq'), 'FM000000');

  INSERT INTO public.ordenes_web (
    folio, nombre, email, telefono, cp, estado, municipio, direccion, referencias,
    envio_cents, envio_desc, subtotal_cents, total_cents
  ) VALUES (
    v_folio, btrim(p_nombre), btrim(p_email), btrim(p_telefono), p_cp, p_estado,
    p_municipio, p_direccion, NULLIF(btrim(coalesce(p_referencias, '')), ''),
    p_envio_cents, p_envio_desc, 0, 0
  ) RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'qty')::int;
    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'cantidad inválida'; END IF;

    SELECT * INTO v_prod FROM public.products
    WHERE id = (v_item->>'product_id')::uuid AND is_active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'producto no disponible'; END IF;
    IF v_prod.quantity < v_qty THEN
      RAISE EXCEPTION 'sin stock suficiente para % (hay %, pide %)',
        v_prod.name, v_prod.quantity, v_qty USING errcode = '23514';
    END IF;

    INSERT INTO public.orden_web_items (orden_id, product_id, nombre, qty, unit_price_cents)
    VALUES (v_id, v_prod.id, v_prod.name, v_qty, v_prod.price_cents);

    -- Hold the stock now — an OXXO voucher can sit unpaid for days and the
    -- counter must not sell the same piece meanwhile.
    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
    VALUES (v_prod.id, -v_qty, 'reserva', v_id, 'online');

    v_subtotal := v_subtotal + v_prod.price_cents * v_qty;
  END LOOP;

  UPDATE public.ordenes_web
     SET subtotal_cents = v_subtotal, total_cents = v_subtotal + p_envio_cents
   WHERE id = v_id;

  RETURN QUERY SELECT v_id, v_folio, v_subtotal, v_subtotal + p_envio_cents;
END;
$$;

-- ============================================================
-- pagar_orden_web — idempotent (Conekta double-fires webhooks).
-- Creates the sale marked canal='online'. NO stock movement: crear_orden_web
-- already reserved it.
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
  IF v_o.status = 'pagada' THEN RETURN v_o.sale_id; END IF;   -- idempotent
  IF v_o.status = 'cancelada' THEN RAISE EXCEPTION 'orden cancelada'; END IF;

  -- Conekta money reaches the bank, never the cash drawer — mapping OXXO to
  -- 'efectivo' would break the corte's "Efectivo en caja".
  v_pm := CASE p_metodo
            WHEN 'card' THEN 'tarjeta'
            WHEN 'spei' THEN 'transferencia'
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
         metodo = p_metodo, conekta_order_id = coalesce(p_conekta_id, conekta_order_id)
   WHERE id = p_orden_id;

  RETURN v_sale_id;
END;
$$;

-- ============================================================
-- cancelar_orden_web — releases the reserved stock.
-- ============================================================
CREATE OR REPLACE FUNCTION public.cancelar_orden_web(p_orden_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_o    public.ordenes_web%ROWTYPE;
  v_item record;
BEGIN
  SELECT * INTO v_o FROM public.ordenes_web WHERE id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'orden no encontrada'; END IF;
  IF v_o.status <> 'pendiente' THEN RETURN; END IF;   -- idempotent

  FOR v_item IN SELECT product_id, qty FROM public.orden_web_items WHERE orden_id = p_orden_id
  LOOP
    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
    VALUES (v_item.product_id, v_item.qty, 'return', p_orden_id, 'online');
  END LOOP;

  UPDATE public.ordenes_web SET status = 'cancelada' WHERE id = p_orden_id;
END;
$$;

-- Storefront writes go through server actions on the admin client, so these are
-- never exposed to anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.crear_orden_web(jsonb, text, text, text, text, text, text, text, text, int, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pagar_orden_web(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancelar_orden_web(uuid) FROM PUBLIC;
