-- The catalog (name, refacción, sistema, carros, conversiones) belongs to the
-- PART, but rows are per inventory. Loading Guadalajara added a second row per
-- SKU with none of the owner's work, and three things then went wrong:
--
--  1. catalogo_buscar picked the row with the most stock. Guadalajara reports
--     100 of everything, so the empty row won and the panel looked wiped.
--  2. Re-uploading a file overwrote names the owner had corrected.
--  3. New rows started blank instead of taking the part's catalog.
--
-- Patched into the live functions: exact fragments, loud failure if one moved.
CREATE INDEX IF NOT EXISTS products_sku_idx ON public.products (sku);

DO $do$
DECLARE d text;
BEGIN
  -- 1. The oldest row of a SKU is the one the catalog was built on.
  d := pg_get_functiondef('public.catalogo_buscar(text,text,text,text,text,integer,integer)'::regprocedure);
  IF position('ORDER BY p.sku, p.quantity DESC' IN d) > 0 THEN
    EXECUTE replace(d, 'ORDER BY p.sku, p.quantity DESC', 'ORDER BY p.sku, p.created_at, p.id');
  ELSIF position('ORDER BY p.sku, p.created_at, p.id' IN d) = 0 THEN
    RAISE EXCEPTION 'catalogo_buscar cambió';
  END IF;

  d := pg_get_functiondef('public.catalogo_pendientes()'::regprocedure);
  IF position('ORDER BY p.sku, p.created_at, p.id' IN d) = 0 THEN
    IF position(E'ORDER BY p.sku\n' IN d) = 0 THEN
      RAISE EXCEPTION 'catalogo_pendientes cambió';
    END IF;
    EXECUTE replace(d, E'ORDER BY p.sku\n', E'ORDER BY p.sku, p.created_at, p.id\n');
  END IF;

  -- 2 and 3. commit_import.
  d := pg_get_functiondef('public.commit_import(jsonb,text,text,uuid,text)'::regprocedure);
  IF position('products_sku_hereda' IN d) > 0 THEN RETURN; END IF;
  IF position($s$name        = COALESCE(NULLIF(v_row->>'name', ''), name),$s$ IN d) = 0
     OR position($s$brand       = COALESCE(v_row->>'brand', brand),$s$ IN d) = 0
     OR position($s$category    = COALESCE(NULLIF(v_row->>'category', ''), category),$s$ IN d) = 0
     OR position('RETURNING id INTO v_product_id;' IN d) = 0 THEN
    RAISE EXCEPTION 'commit_import cambió: no pude aplicar el catálogo por pieza';
  END IF;

  -- The owner's rule: a file only names what has no name. A name equal to the
  -- SKU is the placeholder a nameless row gets, so it counts as none.
  d := replace(d, $s$name        = COALESCE(NULLIF(v_row->>'name', ''), name),$s$,
    $s$name        = CASE WHEN COALESCE(name, '') IN ('', sku)
                          THEN COALESCE(NULLIF(v_row->>'name', ''), name) ELSE name END,$s$);
  -- Brand and category: only "Solo catálogo" replaces; the others fill blanks.
  d := replace(d, $s$brand       = COALESCE(v_row->>'brand', brand),$s$,
    $s$brand       = CASE WHEN p_modo = 'catalogo' THEN COALESCE(v_row->>'brand', brand)
                          ELSE COALESCE(brand, v_row->>'brand') END,$s$);
  d := replace(d, $s$category    = COALESCE(NULLIF(v_row->>'category', ''), category),$s$,
    $s$category    = CASE WHEN p_modo = 'catalogo' THEN COALESCE(NULLIF(v_row->>'category', ''), category)
                          ELSE COALESCE(category, NULLIF(v_row->>'category', '')) END,$s$);
  d := replace(d, 'RETURNING id INTO v_product_id;', $s$RETURNING id INTO v_product_id;

      -- products_sku_hereda: the part is already in another inventory, so this
      -- row takes its catalog instead of starting blank.
      UPDATE public.products n SET
        name = o.name,
        brand = COALESCE(o.brand, n.brand),
        category = COALESCE(o.category, n.category),
        familia = o.familia,
        sistema = o.sistema,
        descripcion = o.descripcion,
        image_url = COALESCE(n.image_url, o.image_url),
        conversion_grupo = o.conversion_grupo,
        numeros_originales = o.numeros_originales
      FROM (SELECT * FROM public.products
             WHERE sku = v_row->>'sku' AND id <> v_product_id
             ORDER BY created_at, id LIMIT 1) o
      WHERE n.id = v_product_id;

      INSERT INTO public.product_tags (product_id, tag_id, condicion, cilindrada)
      SELECT v_product_id, pt.tag_id, pt.condicion, pt.cilindrada
        FROM public.product_tags pt
       WHERE pt.product_id = (SELECT id FROM public.products
                               WHERE sku = v_row->>'sku' AND id <> v_product_id
                               ORDER BY created_at, id LIMIT 1)
      ON CONFLICT DO NOTHING;$s$);
  EXECUTE d;
END $do$;
