-- Equivalencias: one table of part numbers that are the same part, across
-- every brand — the ones the shop sells (Grob, Línea S, Yokomitsu, Baslo…) and
-- the ones it never stocks (SYD), which customers read off the old part.
--
-- Until now a conversión lived only on products.conversion_grupo, set by hand
-- one pair at a time, and a number the shop doesn't stock could only go in
-- numeros_originales of each product. The owner keeps the real table in an
-- Excel (one row per Grob part, one column per brand) and wants:
--   1. Searching ANY number in a row — Grob, Baslo, Yokomitsu, SYD — finds every
--      part of that row the shop carries.
--   2. A product that arrives later (file import, new product, any supplier)
--      joins its row by itself: its SKU is looked up here.
--   3. The Excel loaded in batch.
--
-- So this table is the source and products.conversion_grupo becomes derived:
-- a trigger sets it from the SKU, and tags_texto (what search reads) carries
-- every number of the group.
--
-- A node is (marca, clave). Rows of the Excel that share a node are one group
-- (the importer merges them); the same digits under two brands are two nodes,
-- because Grob 1025001 and SYD 1025001 are different parts.

-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.equivalencias (
  id         bigserial PRIMARY KEY,
  grupo      uuid NOT NULL,
  marca      text NOT NULL,
  clave      text NOT NULL,
  -- The same compaction search uses for a part code: 10-009 = 10 009 = 10009.
  compacta   text GENERATED ALWAYS AS (replace(public.normalizar_busqueda(clave), ' ', '')) STORED,
  -- 'manual': linked in Catálogo. Reloading the Excel keeps these.
  origen     text NOT NULL DEFAULT 'excel' CHECK (origen IN ('excel', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equivalencias_nodo_key UNIQUE (marca, compacta)
);
CREATE INDEX IF NOT EXISTS equivalencias_compacta_idx ON public.equivalencias (compacta);
CREATE INDEX IF NOT EXISTS equivalencias_grupo_idx ON public.equivalencias (grupo);

-- The importer uploads in pieces (a server action takes ~1 MB) and publishes
-- the whole table at once, so search never sees half a file.
CREATE TABLE IF NOT EXISTS public.equivalencias_carga (
  lote       uuid NOT NULL,
  grupo      uuid NOT NULL,
  marca      text NOT NULL,
  clave      text NOT NULL,
  origen     text NOT NULL DEFAULT 'excel',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS equivalencias_carga_lote_idx ON public.equivalencias_carga (lote);

-- Reached only with the admin client and from the functions below.
ALTER TABLE public.equivalencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equivalencias_carga ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.equivalencias, public.equivalencias_carga FROM PUBLIC, anon, authenticated;

-- Matching a product's SKU against compacta goes through this index.
CREATE INDEX IF NOT EXISTS products_sku_compacta_idx
  ON public.products ((replace(public.normalizar_busqueda(sku), ' ', '')));

-- ---------------------------------------------------------------------------
-- A product's brand as a marca of the table. Products without one are 'SIN MARCA'.
CREATE OR REPLACE FUNCTION public.equivalencias_marca(p_brand text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT coalesce(nullif(upper(btrim(p_brand)), ''), 'SIN MARCA');
$$;

-- The group a part number belongs to. The same digits can sit under two
-- brands (Grob 1025001 is not SYD 1025001), so a brand that has its own
-- column in the table only matches that column. A product of a brand without
-- one (TrackOne, Eagle, no brand) matches any: Baslo's numbers are also
-- TrackOne's and Eagle's SKUs. Ties: own brand, a link made by hand, then the
-- brands the shop sells before the ones it only cross-references.
CREATE OR REPLACE FUNCTION public.equivalencias_grupo_de(p_sku text, p_brand text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT e.grupo
    FROM public.equivalencias e
   WHERE e.compacta = replace(public.normalizar_busqueda(p_sku), ' ', '')
     AND e.compacta <> ''
     AND (e.marca = public.equivalencias_marca(p_brand)
          OR NOT EXISTS (SELECT 1 FROM public.equivalencias c
                          WHERE c.marca = public.equivalencias_marca(p_brand) AND c.origen = 'excel'))
   ORDER BY (e.marca = public.equivalencias_marca(p_brand)) DESC,
            (e.origen = 'manual') DESC,
            array_position(ARRAY['GROB', 'YOKOMITSU', 'BASLO', 'TRACKONE', 'EAGLE', 'ACP'], e.marca) NULLS LAST,
            e.id
   LIMIT 1;
$$;

-- What search reads besides name/SKU: the vehicles, the other-brand numbers,
-- and now every number of the part's group (SYD included). Same text as
-- before for a product outside any group.
CREATE OR REPLACE FUNCTION public.tags_texto_de(p_product_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT coalesce((
    SELECT normalizar_busqueda(x) || ' ' || replace(normalizar_busqueda(x), ' ', '')
      FROM (
        SELECT concat_ws(' ',
          (SELECT string_agg(t.nombre, ' ')
             FROM public.product_tags pt JOIN public.tags t ON t.id = pt.tag_id
            WHERE pt.product_id = p.id),
          array_to_string(p.numeros_originales, ' '),
          (SELECT string_agg(e.clave, ' ' ORDER BY e.id)
             FROM public.equivalencias e
            WHERE e.grupo = p.conversion_grupo)) AS x
        FROM public.products p
       WHERE p.id = p_product_id
      ) s
     WHERE x <> ''
  ), '');
$$;

CREATE OR REPLACE FUNCTION public.recalcular_tags_texto(p_product_id uuid)
RETURNS void
LANGUAGE sql
SET search_path = pg_catalog, public, pg_temp
AS $$
  UPDATE public.products p SET tags_texto = public.tags_texto_de(p.id)
   WHERE p.id = p_product_id;
$$;

-- ---------------------------------------------------------------------------
-- A product joins its group by itself: on insert, and whenever its SKU or
-- brand is written (every file import writes brand).
CREATE OR REPLACE FUNCTION public.products_equivalencia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_grupo uuid;
BEGIN
  v_grupo := public.equivalencias_grupo_de(NEW.sku, NEW.brand);
  IF TG_OP = 'INSERT' THEN
    NEW.conversion_grupo := coalesce(v_grupo, NEW.conversion_grupo);
  ELSE
    NEW.conversion_grupo := v_grupo;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS products_equivalencia ON public.products;
CREATE TRIGGER products_equivalencia
  BEFORE INSERT OR UPDATE OF sku, brand ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_equivalencia();

-- A new or changed group changes what the product is found by. The batch
-- functions below create the temp table _eq_lote while they run and refresh in
-- one pass instead: InsForge rejects any session setting
-- in a migration, even the word for it in a comment.
CREATE OR REPLACE FUNCTION public.products_equivalencia_texto()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF to_regclass('pg_temp._eq_lote') IS NULL THEN
    PERFORM public.recalcular_tags_texto(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS products_equivalencia_texto_ins ON public.products;
CREATE TRIGGER products_equivalencia_texto_ins
  AFTER INSERT ON public.products
  FOR EACH ROW WHEN (NEW.conversion_grupo IS NOT NULL)
  EXECUTE FUNCTION public.products_equivalencia_texto();
DROP TRIGGER IF EXISTS products_equivalencia_texto_upd ON public.products;
CREATE TRIGGER products_equivalencia_texto_upd
  AFTER UPDATE ON public.products
  FOR EACH ROW WHEN (OLD.conversion_grupo IS DISTINCT FROM NEW.conversion_grupo)
  EXECUTE FUNCTION public.products_equivalencia_texto();

-- ---------------------------------------------------------------------------
-- Re-derive the products a change touched: those whose SKU is one of the
-- numbers, or that sat in one of the groups. Returns how many changed group.
CREATE OR REPLACE FUNCTION public.equivalencias_refrescar(p_grupos uuid[], p_compactas text[])
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_n integer;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _eq_lote () ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS _eq_tocados (id uuid PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE _eq_tocados;
  INSERT INTO _eq_tocados
  SELECT id FROM public.products
   WHERE replace(public.normalizar_busqueda(sku), ' ', '') = ANY(p_compactas)
  UNION
  SELECT id FROM public.products WHERE conversion_grupo = ANY(p_grupos);

  UPDATE public.products p
     SET conversion_grupo = public.equivalencias_grupo_de(p.sku, p.brand)
    FROM _eq_tocados t
   WHERE p.id = t.id
     AND p.conversion_grupo IS DISTINCT FROM public.equivalencias_grupo_de(p.sku, p.brand);
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE public.products p SET tags_texto = x.t
    FROM (SELECT id, public.tags_texto_de(id) AS t FROM _eq_tocados) x
   WHERE p.id = x.id AND p.tags_texto IS DISTINCT FROM x.t;

  DROP TABLE IF EXISTS _eq_lote;
  RETURN v_n;
END;
$$;

-- Catálogo → Conversiones → "ligar": the two parts become one group, and so
-- does everything either was already equivalent to.
CREATE OR REPLACE FUNCTION public.equivalencias_ligar(p_sku text, p_otro text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  a record; b record; v_grupo uuid; v_viejos uuid[];
BEGIN
  SELECT sku, brand INTO a FROM public.products WHERE sku = p_sku ORDER BY created_at, id LIMIT 1;
  SELECT sku, brand INTO b FROM public.products WHERE sku = p_otro ORDER BY created_at, id LIMIT 1;
  IF a.sku IS NULL OR b.sku IS NULL THEN RAISE EXCEPTION 'No encontré esa clave'; END IF;

  SELECT array_agg(DISTINCT g) INTO v_viejos
    FROM unnest(ARRAY[public.equivalencias_grupo_de(a.sku, a.brand),
                      public.equivalencias_grupo_de(b.sku, b.brand)]) g
   WHERE g IS NOT NULL;
  v_grupo := coalesce(v_viejos[1], gen_random_uuid());

  UPDATE public.equivalencias SET grupo = v_grupo WHERE grupo = ANY(coalesce(v_viejos, '{}'));
  INSERT INTO public.equivalencias (grupo, marca, clave, origen)
  VALUES (v_grupo, public.equivalencias_marca(a.brand), a.sku, 'manual'),
         (v_grupo, public.equivalencias_marca(b.brand), b.sku, 'manual')
  ON CONFLICT (marca, compacta) DO UPDATE SET grupo = EXCLUDED.grupo, origen = 'manual';

  PERFORM public.equivalencias_refrescar(
    array_append(coalesce(v_viejos, '{}'), v_grupo),
    ARRAY(SELECT compacta FROM public.equivalencias WHERE grupo = v_grupo));
  RETURN v_grupo;
END;
$$;

-- "desligar": the other part leaves the group, under every brand it sits in
-- the group with. Reloading an Excel that still pairs them links them again.
CREATE OR REPLACE FUNCTION public.equivalencias_desligar(p_sku text, p_otro text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_grupo uuid; v_compacta text := replace(public.normalizar_busqueda(p_otro), ' ', '');
BEGIN
  SELECT conversion_grupo INTO v_grupo FROM public.products
   WHERE sku = p_sku AND conversion_grupo IS NOT NULL LIMIT 1;
  IF v_grupo IS NULL THEN RETURN; END IF;
  DELETE FROM public.equivalencias WHERE grupo = v_grupo AND compacta = v_compacta;
  PERFORM public.equivalencias_refrescar(ARRAY[v_grupo], ARRAY[v_compacta]);
END;
$$;

-- ---------------------------------------------------------------------------
-- The Excel: replace the table with what the importer uploaded under p_lote
-- (it already merged rows into groups and carried the manual links over).
CREATE OR REPLACE FUNCTION public.equivalencias_publicar(p_lote uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.equivalencias_carga WHERE lote = p_lote) THEN
    RAISE EXCEPTION 'La carga llegó vacía';
  END IF;
  DELETE FROM public.equivalencias;
  INSERT INTO public.equivalencias (grupo, marca, clave, origen)
  SELECT DISTINCT ON (marca, replace(public.normalizar_busqueda(clave), ' ', ''))
         grupo, marca, clave, origen
    FROM public.equivalencias_carga
   WHERE lote = p_lote AND replace(public.normalizar_busqueda(clave), ' ', '') <> ''
   ORDER BY marca, replace(public.normalizar_busqueda(clave), ' ', ''), (origen = 'manual') DESC;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  DELETE FROM public.equivalencias_carga WHERE lote = p_lote OR created_at < now() - interval '1 day';
  RETURN v_n;
END;
$$;

-- After publishing: every product re-derives its group, a page at a time so no
-- call runs into the API's statement timeout. Pass the last id back in.
CREATE OR REPLACE FUNCTION public.equivalencias_aplicar(p_despues uuid, p_limite integer DEFAULT 5000)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_ultimo uuid; v_cambiados integer; v_vistos integer;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _eq_lote () ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS _eq_pagina (id uuid PRIMARY KEY, antes uuid) ON COMMIT DROP;
  TRUNCATE _eq_pagina;
  INSERT INTO _eq_pagina
  SELECT id, conversion_grupo FROM public.products
   WHERE p_despues IS NULL OR id > p_despues
   ORDER BY id LIMIT greatest(1, least(p_limite, 20000));
  GET DIAGNOSTICS v_vistos = ROW_COUNT;
  SELECT id INTO v_ultimo FROM _eq_pagina ORDER BY id DESC LIMIT 1;

  UPDATE public.products p
     SET conversion_grupo = public.equivalencias_grupo_de(p.sku, p.brand)
    FROM _eq_pagina t
   WHERE p.id = t.id
     AND p.conversion_grupo IS DISTINCT FROM public.equivalencias_grupo_de(p.sku, p.brand);
  GET DIAGNOSTICS v_cambiados = ROW_COUNT;

  -- Grouped products always: their group's numbers may have changed even when
  -- the group didn't. Ungrouped ones only if they just left a group.
  UPDATE public.products p SET tags_texto = x.t
    FROM (SELECT q.id, public.tags_texto_de(q.id) AS t
            FROM _eq_pagina t JOIN public.products q ON q.id = t.id
           WHERE q.conversion_grupo IS NOT NULL OR t.antes IS NOT NULL) x
   WHERE p.id = x.id AND p.tags_texto IS DISTINCT FROM x.t;

  DROP TABLE IF EXISTS _eq_lote;
  RETURN jsonb_build_object(
    'ultimo', v_ultimo,
    'vistos', v_vistos,
    'cambiados', v_cambiados,
    'ligados', (SELECT count(*) FROM public.products p JOIN _eq_pagina t ON t.id = p.id
                 WHERE p.conversion_grupo IS NOT NULL));
END;
$$;

-- The two lookups stay callable by authenticated: the product triggers run as
-- whoever writes the product.
REVOKE ALL ON FUNCTION public.equivalencias_grupo_de(text, text), public.tags_texto_de(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equivalencias_grupo_de(text, text), public.tags_texto_de(uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION
  public.equivalencias_refrescar(uuid[], text[]),
  public.equivalencias_ligar(text, text),
  public.equivalencias_desligar(text, text),
  public.equivalencias_publicar(uuid),
  public.equivalencias_aplicar(uuid, integer)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The links made by hand so far become manual rows, so nothing is lost.
INSERT INTO public.equivalencias (grupo, marca, clave, origen)
SELECT DISTINCT ON (public.equivalencias_marca(brand), replace(public.normalizar_busqueda(sku), ' ', ''))
       conversion_grupo, public.equivalencias_marca(brand), sku, 'manual'
  FROM public.products
 WHERE conversion_grupo IS NOT NULL AND replace(public.normalizar_busqueda(sku), ' ', '') <> ''
 ORDER BY public.equivalencias_marca(brand), replace(public.normalizar_busqueda(sku), ' ', ''), created_at, id
ON CONFLICT (marca, compacta) DO NOTHING;

-- Those products are now found by each other's numbers too.
UPDATE public.products SET tags_texto = public.tags_texto_de(id)
 WHERE conversion_grupo IS NOT NULL AND tags_texto IS DISTINCT FROM public.tags_texto_de(id);
