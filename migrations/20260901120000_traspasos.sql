-- Merchandise transfers between inventories, as an auditable document: a new
-- branch ("Otoño Panorama") gets stocked by MOVING pieces from other
-- inventories, and the record answers qué, cuánto, quién, cuándo, de dónde a
-- dónde — so the shop always knows where the merchandise is.
--
-- A transfer EXECUTES atomically at creation. No draft state: "me llevo estas
-- piezas" is one physical act, and a half-open transfer would have the stock
-- be nowhere. The document is immutable once written.
CREATE SEQUENCE IF NOT EXISTS public.traspaso_seq;

CREATE TABLE IF NOT EXISTS public.traspasos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio text NOT NULL UNIQUE,
  origen_id uuid NOT NULL REFERENCES public.inventories(id),
  destino_id uuid NOT NULL REFERENCES public.inventories(id),
  notas text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (origen_id <> destino_id)
);

CREATE TABLE IF NOT EXISTS public.traspaso_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  traspaso_id uuid NOT NULL REFERENCES public.traspasos(id) ON DELETE CASCADE,
  -- Both rows are kept: the origin product the stock left, and the destination
  -- product (same SKU, that inventory's own row) it arrived at.
  producto_origen_id uuid NOT NULL REFERENCES public.products(id),
  producto_destino_id uuid NOT NULL REFERENCES public.products(id),
  qty integer NOT NULL CHECK (qty > 0)
);
CREATE INDEX IF NOT EXISTS traspaso_items_traspaso_idx ON public.traspaso_items (traspaso_id);

ALTER TABLE public.traspasos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traspaso_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "authenticated read traspasos" ON public.traspasos
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "authenticated read traspaso_items" ON public.traspaso_items
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT ON public.traspasos, public.traspaso_items TO authenticated;

-- The movement ledger learns the transfer reason: one -qty at origin and one
-- +qty at destination, both ref'ing the traspaso. movements_apply does the
-- quantity arithmetic — no manual UPDATE, that path double-counts.
ALTER TABLE public.inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_reason_check;
ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_reason_check
  CHECK (reason = ANY (ARRAY['import','sale','adjustment','return','reserva',
                             'purchase','purchase_cancel','purchase_return','traspaso']));

CREATE OR REPLACE FUNCTION public.ejecutar_traspaso(
  p_origen uuid,
  p_destino uuid,
  p_items jsonb,   -- [{product_id, qty}]
  p_notas text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid   text := public.requesting_user_id();
  v_id    uuid;
  v_folio text;
  v_item  jsonb;
  v_qty   int;
  v_orig  public.products%ROWTYPE;
  v_dest_id uuid;
  v_drop  boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF NOT public.tiene_permiso('inventario_gestionar') THEN
    RAISE EXCEPTION 'sin permiso para traspasar mercancía' USING errcode = '42501';
  END IF;
  IF p_origen = p_destino THEN
    RAISE EXCEPTION 'el origen y el destino son el mismo inventario';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'no hay productos que traspasar';
  END IF;
  -- Dropship inventories hold no physical stock — nothing to move in or out.
  SELECT bool_or(coalesce(es_dropship, false)) INTO v_drop
  FROM public.inventories WHERE id IN (p_origen, p_destino);
  IF coalesce(v_drop, false) THEN
    RAISE EXCEPTION 'un inventario dropship no traspasa mercancía física';
  END IF;

  v_folio := 'TR-' || to_char(nextval('public.traspaso_seq'), 'FM000000');
  INSERT INTO public.traspasos (folio, origen_id, destino_id, notas, created_by)
  VALUES (v_folio, p_origen, p_destino, NULLIF(btrim(coalesce(p_notas, '')), ''), v_uid)
  RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'qty')::int;
    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'cantidad inválida'; END IF;

    SELECT * INTO v_orig FROM public.products
    WHERE id = (v_item->>'product_id')::uuid AND inventory_id = p_origen
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'el producto no está en el inventario de origen';
    END IF;
    IF v_orig.quantity < v_qty THEN
      RAISE EXCEPTION 'stock insuficiente de % (hay %, se piden %)',
        v_orig.name, v_orig.quantity, v_qty USING errcode = '23514';
    END IF;

    -- Same SKU in the destination inventory, or a clone of the origin row.
    -- image_key stays NULL on purpose: the URL points at the origin's stored
    -- photo, but the destination must never OWN (and later delete) an object
    -- that belongs to the origin product's key.
    SELECT id INTO v_dest_id FROM public.products
    WHERE inventory_id = p_destino AND sku = v_orig.sku
    FOR UPDATE;
    IF v_dest_id IS NULL THEN
      INSERT INTO public.products
        (sku, name, brand, size, color, category, cost_cents, price_cents,
         quantity, is_active, inventory_id, etiqueta, image_url,
         proveedor_id, enlace_proveedor, attributes, created_by)
      VALUES
        (v_orig.sku, v_orig.name, v_orig.brand, v_orig.size, v_orig.color,
         v_orig.category, v_orig.cost_cents, v_orig.price_cents,
         0, true, p_destino, v_orig.etiqueta, v_orig.image_url,
         v_orig.proveedor_id, v_orig.enlace_proveedor, v_orig.attributes, v_uid)
      RETURNING id INTO v_dest_id;
      -- Compatibility travels with the part.
      INSERT INTO public.product_tags (product_id, tag_id)
      SELECT v_dest_id, tag_id FROM public.product_tags WHERE product_id = v_orig.id
      ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO public.traspaso_items (traspaso_id, producto_origen_id, producto_destino_id, qty)
    VALUES (v_id, v_orig.id, v_dest_id, v_qty);

    -- The trigger applies both deltas to products.quantity.
    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
    VALUES (v_orig.id, -v_qty, 'traspaso', v_id, v_uid),
           (v_dest_id,  v_qty, 'traspaso', v_id, v_uid);
  END LOOP;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ejecutar_traspaso(uuid, uuid, jsonb, text) TO authenticated;
