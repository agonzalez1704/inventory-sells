-- Two changes that the refaccionaria's catalog forces, both about the same
-- thing: a spreadsheet is not a shipment.
--
-- 1. A product with no price must not be sellable.
-- 2. A daily full-state export must not be re-added as if it were new stock.
--
-- ---------------------------------------------------------------------------
-- 1. No sale line at price zero
-- ---------------------------------------------------------------------------
-- Ruli's catalog has 3,534 products that have stock but no price in their ERP.
-- They still have to appear — staff need to see the part exists and go ask for
-- a price — so they are imported as-is with price_cents = 0, which is the
-- signal for "not sellable" (no extra column needed).
--
-- The guard goes on the line tables rather than inside register_sale, because
-- there are three functions that create sellable lines today (register_sale,
-- crear_orden_web, register_loan) plus the quote path, and a check in one of
-- them leaves the others open. A trigger on the table catches every path,
-- including ones added later.
--
-- This has already bitten us once at Fiable's scale: one accidental $0 sale on
-- 2026-07-01 out of 422 lines. That row stays as it is — the trigger only
-- looks at new rows, so no history is rewritten.
CREATE OR REPLACE FUNCTION public.rechazar_precio_cero()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_sku text;
BEGIN
  IF COALESCE(NEW.unit_price_cents, 0) > 0 THEN
    RETURN NEW;
  END IF;
  SELECT sku INTO v_sku FROM public.products WHERE id = NEW.product_id;
  RAISE EXCEPTION 'El producto % no tiene precio: asígnale uno antes de venderlo',
    COALESCE(v_sku, NEW.product_id::text) USING errcode = '23514';
END;
$$;

CREATE TRIGGER sale_items_precio_cero
  BEFORE INSERT ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.rechazar_precio_cero();

CREATE TRIGGER orden_web_items_precio_cero
  BEFORE INSERT ON public.orden_web_items
  FOR EACH ROW EXECUTE FUNCTION public.rechazar_precio_cero();

-- Quotes too, so the seller finds out while building it instead of at the
-- moment they try to convert it into a sale.
CREATE TRIGGER cotizacion_items_precio_cero
  BEFORE INSERT ON public.cotizacion_items
  FOR EACH ROW EXECUTE FUNCTION public.rechazar_precio_cero();

-- ---------------------------------------------------------------------------
-- 2. commit_import learns what the numbers mean
-- ---------------------------------------------------------------------------
-- Until now `quantity` was always treated as goods arriving: the function adds
-- a +qty movement. That is right for the original use case (a photo of a
-- delivery) and wrong for a daily full-state ERP export, where re-importing the
-- same file would add the whole catalog's stock a second time.
--
-- The refaccionaria runs both systems for one week, then drops their ERP. That
-- is exactly two semantics, so the mode is now explicit:
--
--   alta      +qty. A shipment arrived. Unchanged behaviour, still the default
--             so every existing caller keeps working.
--   espejo    quantity BECOMES the file's value (delta = file - current).
--             Their ERP owns stock. Week one only.
--   catalogo  quantity is ignored entirely; only names, prices, costs and
--             categories are updated. Our POS owns stock. Week two onward.
--
-- `espejo` is the only mode that can destroy data — run it after the cutover
-- and it silently erases every sale the POS recorded since the file was
-- exported. It is never the default, and the UI has to ask for it by name.
DROP FUNCTION IF EXISTS public.commit_import(jsonb, text, text, uuid);

CREATE OR REPLACE FUNCTION public.commit_import(
  p_rows         jsonb,
  p_source       text,
  p_filename     text,
  p_inventory_id uuid,
  p_modo         text DEFAULT 'alta'
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
  v_delta      int;
  v_inserted   int := 0;
  v_updated    int := 0;
  v_movidos    int := 0;
  v_bajas      int := 0;
  v_sin_precio int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF NOT (public.is_admin() OR public.has_permiso('inventario_gestionar')) THEN
    RAISE EXCEPTION 'admin only' USING errcode = '42501';
  END IF;
  IF p_modo NOT IN ('alta', 'espejo', 'catalogo') THEN
    RAISE EXCEPTION 'modo inválido: % (usa alta, espejo o catalogo)', p_modo;
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
    IF COALESCE((v_row->>'price_cents')::int, 0) = 0 THEN
      v_sin_precio := v_sin_precio + 1;
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
      v_existing.quantity := 0;   -- a brand-new product starts empty in every mode
      v_inserted := v_inserted + 1;
    END IF;

    -- What the number in the file means, per mode.
    v_delta := CASE p_modo
                 WHEN 'alta'     THEN v_qty
                 WHEN 'espejo'   THEN v_qty - COALESCE(v_existing.quantity, 0)
                 ELSE 0                     -- catalogo: stock is not ours to touch
               END;

    -- inventory_movements rejects a zero delta, and a no-op is not worth a row.
    IF v_delta <> 0 THEN
      INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
      VALUES (v_product_id, v_delta, 'import', v_batch_id, v_uid);
      v_movidos := v_movidos + 1;
      IF v_delta < 0 THEN v_bajas := v_bajas + 1; END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'batch_id',   v_batch_id,
    'modo',       p_modo,
    'inserted',   v_inserted,
    'updated',    v_updated,
    'movidos',    v_movidos,     -- productos cuya existencia cambió
    'bajas',      v_bajas,       -- de esos, cuántos BAJARON (la señal de alarma)
    'sin_precio', v_sin_precio   -- entran visibles pero no vendibles
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.commit_import(jsonb, text, text, uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.commit_import(jsonb, text, text, uuid, text) TO authenticated;
