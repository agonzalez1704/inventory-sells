-- Make the products catalog category-agnostic so any product type works:
-- phone screens, batteries, cases, cables, power banks, chargers, shoes, etc.
-- Generic core stays typed; type-specific specs live in `attributes` (JSONB).

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category   TEXT,
  ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);

-- Admins may edit the new columns (RLS still gates which rows via is_admin()).
GRANT UPDATE (category, attributes) ON public.products TO authenticated;

-- Extend commit_import to upsert category + attributes.
-- p_rows: [{ sku, name?, brand?, size?, color?, category?, attributes?(object),
--            cost_cents?, price_cents?, quantity? }]
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
        category    = COALESCE(NULLIF(v_row->>'category', ''), category),
        attributes  = COALESCE(v_row->'attributes', attributes),
        cost_cents  = COALESCE((v_row->>'cost_cents')::int, cost_cents),
        price_cents = COALESCE((v_row->>'price_cents')::int, price_cents)
      WHERE id = v_existing.id;
      v_product_id := v_existing.id;
      v_updated := v_updated + 1;
    ELSE
      INSERT INTO public.products
        (sku, name, brand, size, color, category, attributes, cost_cents, price_cents, quantity, created_by)
      VALUES (
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
