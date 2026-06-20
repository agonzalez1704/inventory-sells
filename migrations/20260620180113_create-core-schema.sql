-- Inventory POS — core schema (V1)
-- Internal back-office, one business, roles admin/seller.
-- Stock is server-maintained via an append-only ledger (inventory_movements).
-- No BEGIN/COMMIT: the backend wraps each migration in its own transaction.

-- ============================================================
-- Helper: touch updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- ============================================================
-- profiles — one row per auth user, holds role
-- Written only via the admin client (server actions). Clients cannot
-- self-insert/update to prevent role escalation.
-- ============================================================
CREATE TABLE public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT,
  role       TEXT NOT NULL DEFAULT 'seller' CHECK (role IN ('admin', 'seller')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER profiles_touch_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Team members can see each other (names, roles).
CREATE POLICY "authenticated read profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

-- No client writes: profile creation/role changes go through the admin client.
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon, authenticated;
GRANT  USAGE ON SCHEMA public TO anon, authenticated;
GRANT  SELECT ON public.profiles TO authenticated;

-- Role check helper. SECURITY DEFINER so RLS policies that call it do not
-- recurse through profiles' own RLS.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ============================================================
-- products — sellable SKU/variant. quantity is a server-maintained cache.
-- ============================================================
CREATE TABLE public.products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  brand       TEXT,
  size        TEXT,
  color       TEXT,
  cost_cents  INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  quantity    INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_is_active ON public.products(is_active);

CREATE TRIGGER products_touch_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read products"
  ON public.products FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

-- Admins edit catalog fields only. Creation + stock go through RPCs.
CREATE POLICY "admin update products"
  ON public.products FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Lock down the write surface: no client INSERT/DELETE; sku + quantity immutable
-- from the client (set by RPCs / ledger trigger only).
REVOKE INSERT, UPDATE, DELETE ON public.products FROM anon, authenticated;
GRANT  SELECT ON public.products TO authenticated;
GRANT  UPDATE (name, brand, size, color, cost_cents, price_cents, is_active)
  ON public.products TO authenticated;

-- ============================================================
-- inventory_movements — append-only ledger. Source of truth for stock.
-- ============================================================
CREATE TABLE public.inventory_movements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  delta      INTEGER NOT NULL CHECK (delta <> 0),
  reason     TEXT NOT NULL CHECK (reason IN ('import', 'sale', 'adjustment', 'return')),
  ref_id     UUID,
  note       TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_movements_product_id ON public.inventory_movements(product_id);
CREATE INDEX idx_movements_created_at ON public.inventory_movements(created_at);
CREATE INDEX idx_movements_ref_id     ON public.inventory_movements(ref_id);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read movements"
  ON public.inventory_movements FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

-- Append-only + RPC-only: clients can read history, never write it.
REVOKE INSERT, UPDATE, DELETE ON public.inventory_movements FROM anon, authenticated;
GRANT  SELECT ON public.inventory_movements TO authenticated;

-- Maintain products.quantity from the ledger. SECURITY DEFINER bypasses the
-- client column lock-down. CHECK (quantity >= 0) backstops oversell.
CREATE OR REPLACE FUNCTION public.apply_inventory_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE public.products
  SET quantity = quantity + NEW.delta
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER movements_apply
  AFTER INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_inventory_movement();

-- ============================================================
-- sales + sale_items — written only via register_sale()
-- ============================================================
CREATE TABLE public.sales (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_cents    INTEGER NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  payment_method TEXT NOT NULL DEFAULT 'efectivo'
                 CHECK (payment_method IN ('efectivo', 'tarjeta', 'transferencia', 'otro')),
  status         TEXT NOT NULL DEFAULT 'completed'
                 CHECK (status IN ('completed', 'void')),
  customer_name  TEXT,
  sold_by        UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sales_sold_by    ON public.sales(sold_by);
CREATE INDEX idx_sales_created_at ON public.sales(created_at);

CREATE TABLE public.sale_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id          UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id       UUID NOT NULL REFERENCES public.products(id),
  qty              INTEGER NOT NULL CHECK (qty > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0)
);

CREATE INDEX idx_sale_items_sale_id    ON public.sale_items(sale_id);
CREATE INDEX idx_sale_items_product_id ON public.sale_items(product_id);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read sales"
  ON public.sales FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "authenticated read sale_items"
  ON public.sale_items FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

REVOKE INSERT, UPDATE, DELETE ON public.sales FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sale_items FROM anon, authenticated;
GRANT  SELECT ON public.sales TO authenticated;
GRANT  SELECT ON public.sale_items TO authenticated;

-- ============================================================
-- import_batches — written only via commit_import()
-- ============================================================
CREATE TABLE public.import_batches (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source     TEXT NOT NULL CHECK (source IN ('excel', 'csv', 'pdf')),
  filename   TEXT,
  row_count  INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_import_batches_created_at ON public.import_batches(created_at);

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read import_batches"
  ON public.import_batches FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

REVOKE INSERT, UPDATE, DELETE ON public.import_batches FROM anon, authenticated;
GRANT  SELECT ON public.import_batches TO authenticated;

-- ============================================================
-- RPC: register_sale — atomic sale + stock decrement, rejects oversell
-- p_items: [{ "product_id": uuid, "qty": int }]
-- ============================================================
CREATE OR REPLACE FUNCTION public.register_sale(
  p_items          jsonb,
  p_payment_method text DEFAULT 'efectivo',
  p_customer_name  text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid        uuid := (SELECT auth.uid());
  v_sale_id    uuid;
  v_item       jsonb;
  v_product    public.products%ROWTYPE;
  v_qty        int;
  v_line_total int;
  v_total      int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'no items';
  END IF;

  INSERT INTO public.sales (payment_method, customer_name, sold_by, total_cents)
  VALUES (p_payment_method, p_customer_name, v_uid, 0)
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'qty')::int;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'invalid qty for item %', v_item;
    END IF;

    -- Lock the product row to serialize concurrent sales.
    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::uuid
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'product % not found', v_item->>'product_id';
    END IF;
    IF v_product.quantity < v_qty THEN
      RAISE EXCEPTION 'insufficient stock for % (have %, need %)',
        v_product.sku, v_product.quantity, v_qty USING errcode = '23514';
    END IF;

    v_line_total := v_product.price_cents * v_qty;
    v_total := v_total + v_line_total;

    INSERT INTO public.sale_items (sale_id, product_id, qty, unit_price_cents, line_total_cents)
    VALUES (v_sale_id, v_product.id, v_qty, v_product.price_cents, v_line_total);

    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
    VALUES (v_product.id, -v_qty, 'sale', v_sale_id, v_uid);
  END LOOP;

  UPDATE public.sales SET total_cents = v_total WHERE id = v_sale_id;
  RETURN v_sale_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_sale(jsonb, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.register_sale(jsonb, text, text) TO authenticated;

-- ============================================================
-- RPC: commit_import — admin-only upsert by SKU + import movements
-- p_rows: [{ sku, name?, brand?, size?, color?, cost_cents?, price_cents?, quantity? }]
-- ============================================================
CREATE OR REPLACE FUNCTION public.commit_import(
  p_rows     jsonb,
  p_source   text,
  p_filename text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid        uuid := (SELECT auth.uid());
  v_batch_id   uuid;
  v_row        jsonb;
  v_existing   public.products%ROWTYPE;
  v_product_id uuid;
  v_qty        int;
  v_inserted   int := 0;
  v_updated    int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only' USING errcode = '42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'no rows';
  END IF;

  INSERT INTO public.import_batches (source, filename, row_count, created_by)
  VALUES (p_source, p_filename, jsonb_array_length(p_rows), v_uid)
  RETURNING id INTO v_batch_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    IF COALESCE(v_row->>'sku', '') = '' THEN
      RAISE EXCEPTION 'row missing sku: %', v_row;
    END IF;
    v_qty := COALESCE((v_row->>'quantity')::int, 0);
    IF v_qty < 0 THEN
      RAISE EXCEPTION 'negative quantity for sku %', v_row->>'sku';
    END IF;

    SELECT * INTO v_existing FROM public.products
    WHERE sku = (v_row->>'sku') FOR UPDATE;

    IF FOUND THEN
      UPDATE public.products SET
        name        = COALESCE(NULLIF(v_row->>'name', ''), name),
        brand       = COALESCE(v_row->>'brand', brand),
        size        = COALESCE(v_row->>'size', size),
        color       = COALESCE(v_row->>'color', color),
        cost_cents  = COALESCE((v_row->>'cost_cents')::int, cost_cents),
        price_cents = COALESCE((v_row->>'price_cents')::int, price_cents)
      WHERE id = v_existing.id;
      v_product_id := v_existing.id;
      v_updated := v_updated + 1;
    ELSE
      INSERT INTO public.products (sku, name, brand, size, color, cost_cents, price_cents, quantity, created_by)
      VALUES (
        v_row->>'sku',
        COALESCE(NULLIF(v_row->>'name', ''), v_row->>'sku'),
        v_row->>'brand', v_row->>'size', v_row->>'color',
        COALESCE((v_row->>'cost_cents')::int, 0),
        COALESCE((v_row->>'price_cents')::int, 0),
        0, v_uid
      )
      RETURNING id INTO v_product_id;
      v_inserted := v_inserted + 1;
    END IF;

    IF v_qty > 0 THEN
      INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
      VALUES (v_product_id, v_qty, 'import', v_batch_id, v_uid);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'inserted', v_inserted,
    'updated',  v_updated
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.commit_import(jsonb, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.commit_import(jsonb, text, text) TO authenticated;

-- ============================================================
-- RPC: adjust_stock — admin-only manual correction (recount, damage, return)
-- ============================================================
CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_product_id uuid,
  p_delta      int,
  p_reason     text DEFAULT 'adjustment',
  p_note       text DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid     uuid := (SELECT auth.uid());
  v_product public.products%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only' USING errcode = '42501';
  END IF;
  IF p_delta = 0 THEN
    RAISE EXCEPTION 'delta cannot be zero';
  END IF;
  IF p_reason NOT IN ('adjustment', 'return') THEN
    RAISE EXCEPTION 'invalid reason %', p_reason;
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product not found';
  END IF;
  IF v_product.quantity + p_delta < 0 THEN
    RAISE EXCEPTION 'adjustment would make stock negative (have %, delta %)',
      v_product.quantity, p_delta USING errcode = '23514';
  END IF;

  INSERT INTO public.inventory_movements (product_id, delta, reason, note, created_by)
  VALUES (p_product_id, p_delta, p_reason, p_note, v_uid);

  RETURN v_product.quantity + p_delta;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.adjust_stock(uuid, int, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.adjust_stock(uuid, int, text, text) TO authenticated;
