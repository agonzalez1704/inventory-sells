-- Multiple inventories under one app. Each product belongs to an inventory.
-- Sales/loans are unaffected (they reference products by id), so a cart can mix
-- items from any inventory and search spans all of them.

CREATE TABLE public.inventories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.inventories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read inventories"
  ON public.inventories FOR SELECT TO authenticated
  USING (public.requesting_user_id() IS NOT NULL);

CREATE POLICY "admin insert inventories"
  ON public.inventories FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "admin update inventories"
  ON public.inventories FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

REVOKE DELETE ON public.inventories FROM anon, authenticated;
GRANT  SELECT, INSERT, UPDATE ON public.inventories TO authenticated;

-- ---- products gain an inventory ----
ALTER TABLE public.products
  ADD COLUMN inventory_id UUID REFERENCES public.inventories(id);

-- Backfill: create the default inventory and move every existing product into it.
WITH ins AS (
  INSERT INTO public.inventories (name) VALUES ('Pana''s Batteries') RETURNING id
)
UPDATE public.products SET inventory_id = (SELECT id FROM ins)
WHERE inventory_id IS NULL;

ALTER TABLE public.products ALTER COLUMN inventory_id SET NOT NULL;

CREATE INDEX idx_products_inventory_id ON public.products(inventory_id);

-- SKU is now unique per inventory, not globally.
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sku_key;
ALTER TABLE public.products
  ADD CONSTRAINT products_inventory_sku_key UNIQUE (inventory_id, sku);

-- Track which inventory an import targeted.
ALTER TABLE public.import_batches ADD COLUMN inventory_id UUID REFERENCES public.inventories(id);

-- ---- commit_import now targets one inventory; upsert keys on (inventory_id, sku) ----
DROP FUNCTION IF EXISTS public.commit_import(jsonb, text, text);

CREATE OR REPLACE FUNCTION public.commit_import(
  p_rows         jsonb,
  p_source       text,
  p_filename     text,
  p_inventory_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid        text := public.requesting_user_id();
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
  IF NOT EXISTS (SELECT 1 FROM public.inventories WHERE id = p_inventory_id) THEN
    RAISE EXCEPTION 'inventory not found';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'no rows';
  END IF;

  INSERT INTO public.import_batches (source, filename, row_count, inventory_id, created_by)
  VALUES (p_source, p_filename, jsonb_array_length(p_rows), p_inventory_id, v_uid)
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
    WHERE inventory_id = p_inventory_id AND sku = (v_row->>'sku') FOR UPDATE;

    IF FOUND THEN
      UPDATE public.products SET
        name        = COALESCE(NULLIF(v_row->>'name', ''), name),
        brand       = COALESCE(v_row->>'brand', brand),
        size        = COALESCE(v_row->>'size', size),
        color       = COALESCE(v_row->>'color', color),
        category    = COALESCE(NULLIF(v_row->>'category', ''), category),
        attributes  = COALESCE(v_row->'attributes', attributes),
        cost_cents  = COALESCE((v_row->>'cost_cents')::int, cost_cents),
        price_cents = COALESCE((v_row->>'price_cents')::int, price_cents)
      WHERE id = v_existing.id;
      v_product_id := v_existing.id;
      v_updated := v_updated + 1;
    ELSE
      INSERT INTO public.products
        (inventory_id, sku, name, brand, size, color, category, attributes, cost_cents, price_cents, quantity, created_by)
      VALUES (
        p_inventory_id,
        v_row->>'sku',
        COALESCE(NULLIF(v_row->>'name', ''), v_row->>'sku'),
        v_row->>'brand', v_row->>'size', v_row->>'color',
        NULLIF(v_row->>'category', ''),
        COALESCE(v_row->'attributes', '{}'::jsonb),
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

REVOKE EXECUTE ON FUNCTION public.commit_import(jsonb, text, text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.commit_import(jsonb, text, text, uuid) TO authenticated;
