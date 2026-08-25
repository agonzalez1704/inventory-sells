-- Compatibility tags: free-form labels ("Tsuru 1992-1997", "Sentra B13") that
-- staff attach to products. Two products that share a tag are compatible — the
-- auto-parts equivalent of the phone shop's shared-model grouping, where the
-- product NAME carries the model. Auto part names carry nothing ("BALATA F D
-- JGO"), so the link lives in data instead.
CREATE TABLE IF NOT EXISTS public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  -- Normalized once for dedupe + autocomplete: "Tsuru 92" and "TSURU 92" are
  -- the same tag, and letting both exist silently splits a compatibility group.
  nombre_norm text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_tags (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, tag_id)
);
CREATE INDEX IF NOT EXISTS product_tags_tag_idx ON public.product_tags (tag_id);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_tags ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "authenticated read tags" ON public.tags
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "authenticated read product_tags" ON public.product_tags
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT ON public.tags, public.product_tags TO authenticated;

-- ---------------------------------------------------------------------------
-- Search: tags must be findable ("tsuru" finds every part tagged Tsuru even
-- though no part is named that). `busqueda` is a GENERATED column and cannot
-- reach another table, so the tag text is denormalized here and kept in sync by
-- trigger — same normalized+compact shape busqueda uses, so the one LIKE
-- pre-filter reads both the same way.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tags_texto text NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION public.recalcular_tags_texto(p_product_id uuid)
RETURNS void
LANGUAGE sql
SET search_path = pg_catalog, public, pg_temp
AS $$
  UPDATE public.products SET tags_texto = coalesce((
    SELECT normalizar_busqueda(string_agg(t.nombre, ' '))
           || ' ' || replace(normalizar_busqueda(string_agg(t.nombre, ' ')), ' ', '')
    FROM public.product_tags pt JOIN public.tags t ON t.id = pt.tag_id
    WHERE pt.product_id = p_product_id
  ), '')
  WHERE id = p_product_id;
$$;

CREATE OR REPLACE FUNCTION public.product_tags_sync()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.recalcular_tags_texto(coalesce(NEW.product_id, OLD.product_id));
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS product_tags_sync_trg ON public.product_tags;
CREATE TRIGGER product_tags_sync_trg
  AFTER INSERT OR DELETE ON public.product_tags
  FOR EACH ROW EXECUTE FUNCTION public.product_tags_sync();

-- Renaming a tag re-labels every product that carries it.
CREATE OR REPLACE FUNCTION public.tags_rename_sync()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.recalcular_tags_texto(pt.product_id)
    FROM public.product_tags pt WHERE pt.tag_id = NEW.id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tags_rename_sync_trg ON public.tags;
CREATE TRIGGER tags_rename_sync_trg
  AFTER UPDATE OF nombre ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.tags_rename_sync();

-- ---------------------------------------------------------------------------
-- Compatibles: products sharing at least one tag, best-connected first.
CREATE OR REPLACE FUNCTION public.productos_compatibles(
  p_product_id uuid,
  p_limit integer DEFAULT 12
)
RETURNS TABLE (
  id uuid, sku text, name text, brand text, price_cents integer,
  quantity integer, image_url text, tags_compartidos integer
)
LANGUAGE sql STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT p.id, p.sku, p.name, p.brand, p.price_cents, p.quantity, p.image_url,
         count(*)::integer AS tags_compartidos
  FROM public.product_tags mios
  JOIN public.product_tags otros
    ON otros.tag_id = mios.tag_id AND otros.product_id <> mios.product_id
  JOIN public.products p ON p.id = otros.product_id AND p.is_active
  WHERE mios.product_id = p_product_id
  GROUP BY p.id, p.sku, p.name, p.brand, p.price_cents, p.quantity, p.image_url
  ORDER BY count(*) DESC, (p.quantity > 0) DESC, p.name
  LIMIT greatest(1, least(coalesce(p_limit, 12), 48));
$$;
GRANT EXECUTE ON FUNCTION public.productos_compatibles(uuid, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- The candidate pre-filter learns to read tags: a token matches a product when
-- it lands in `busqueda` OR in `tags_texto`. Same signature and return type,
-- so CREATE OR REPLACE is safe.
CREATE OR REPLACE FUNCTION public.buscar_productos_candidatos(
  p_tokens jsonb,
  p_inventory_id uuid DEFAULT NULL,
  p_categoria text DEFAULT NULL,
  p_limit integer DEFAULT 1000
)
RETURNS SETOF public.products
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_sql     text := 'SELECT * FROM public.products WHERE is_active';
  v_grupo   jsonb;
  v_ors     text;
  v_nombre  text;
  v_puntos  text := '0';
BEGIN
  IF p_inventory_id IS NOT NULL THEN
    v_sql := v_sql || format(' AND inventory_id = %L', p_inventory_id);
  END IF;
  IF p_categoria IS NOT NULL AND p_categoria <> '' THEN
    v_sql := v_sql || format(' AND category = %L', p_categoria);
  END IF;

  IF p_tokens IS NOT NULL AND jsonb_typeof(p_tokens) = 'array' THEN
    FOR v_grupo IN SELECT * FROM jsonb_array_elements(p_tokens)
    LOOP
      SELECT string_agg(
               format('(busqueda LIKE %L OR tags_texto LIKE %L)',
                      '%' || t || '%', '%' || t || '%'),
               ' OR '),
             string_agg(format('busqueda_nombre LIKE %L', '%' || t || '%'), ' OR ')
        INTO v_ors, v_nombre
        FROM jsonb_array_elements_text(v_grupo) t
       WHERE t <> '';
      IF v_ors IS NOT NULL THEN
        v_sql   := v_sql || ' AND (' || v_ors || ')';
        -- One point per query token that also lands in the name.
        v_puntos := v_puntos || ' + ((' || v_nombre || '))::int';
      END IF;
    END LOOP;
  END IF;

  v_sql := v_sql || format(
    ' ORDER BY (%s) DESC, (quantity > 0) DESC, name LIMIT %s',
    v_puntos, greatest(1, least(coalesce(p_limit, 1000), 5000)));

  RETURN QUERY EXECUTE v_sql;
END;
$$;
