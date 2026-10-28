-- The catalog is worked in the app, not in the owner's Excel (approved mockup:
-- https://claude.ai/artifact/RtYz4UDABCDcUkbPjkBfWq). The Excel stays for
-- prices only.

-- ---------------------------------------------------------------------------
-- Conversiones: the same part under another clave (DMNN0900 = DMNN0800).
-- A group, not pairs: linking A to B and B to C makes all three one part, so
-- each shows the others whichever one the counter looks up.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS conversion_grupo uuid;
CREATE INDEX IF NOT EXISTS products_conversion_grupo_idx
  ON public.products (conversion_grupo) WHERE conversion_grupo IS NOT NULL;

-- Original / other-brand numbers: not stock, only something to search by.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS numeros_originales text[] NOT NULL DEFAULT '{}';

-- The search text carries them, next to the vehicles: a customer reading a
-- number off the old part finds this one.
CREATE OR REPLACE FUNCTION public.recalcular_tags_texto(p_product_id uuid)
RETURNS void
LANGUAGE sql
SET search_path = pg_catalog, public, pg_temp
AS $$
  UPDATE public.products p SET tags_texto = coalesce((
    SELECT normalizar_busqueda(x) || ' ' || replace(normalizar_busqueda(x), ' ', '')
      FROM (
        SELECT concat_ws(' ',
          (SELECT string_agg(t.nombre, ' ')
             FROM public.product_tags pt JOIN public.tags t ON t.id = pt.tag_id
            WHERE pt.product_id = p.id),
          array_to_string(p.numeros_originales, ' ')) AS x
      ) s
     WHERE x <> ''
  ), '')
  WHERE p.id = p_product_id;
$$;

CREATE OR REPLACE FUNCTION public.numeros_originales_sync()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.recalcular_tags_texto(NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS numeros_originales_sync_trg ON public.products;
CREATE TRIGGER numeros_originales_sync_trg
  AFTER UPDATE OF numeros_originales ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.numeros_originales_sync();

-- ---------------------------------------------------------------------------
-- The catalog screen: one page of parts with what each still lacks.
-- p_falta: 'carros' (no vehicle), 'refaccion', 'sistema'.
CREATE OR REPLACE FUNCTION public.catalogo_buscar(
  p_q       text DEFAULT NULL,
  p_sistema text DEFAULT NULL,
  p_familia text DEFAULT NULL,
  p_marca   text DEFAULT NULL,
  p_falta   text DEFAULT NULL,
  p_limit   int  DEFAULT 50,
  p_offset  int  DEFAULT 0
)
RETURNS TABLE (
  id uuid, sku text, name text, familia text, familia_nombre text, sistema text,
  brand text, price_cents int, quantity int, image_url text,
  carros text[], n_carros int, n_conv int, total bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH base AS (
    -- One row per sku: the same part sits in more than one inventory.
    SELECT DISTINCT ON (p.sku) p.id, p.sku, p.name, p.familia, f.nombre AS familia_nombre,
           coalesce(p.sistema, f.sistema) AS sistema, p.brand, p.price_cents, p.quantity,
           p.image_url, p.conversion_grupo,
           EXISTS (SELECT 1 FROM product_tags pt JOIN tags t ON t.id = pt.tag_id
                    WHERE pt.product_id = p.id AND t.veh_marca IS NOT NULL) AS con_carros
      FROM products p
      LEFT JOIN familias f ON f.id = p.familia
     WHERE p.is_active
       AND (p_q IS NULL OR p.sku ILIKE '%' || p_q || '%' OR p.name ILIKE '%' || p_q || '%'
            OR p.tags_texto LIKE '%' || normalizar_busqueda(p_q) || '%')
       AND (p_sistema IS NULL OR coalesce(p.sistema, f.sistema) = p_sistema)
       AND (p_familia IS NULL OR p.familia = p_familia)
       AND (p_marca IS NULL OR p.brand = p_marca)
     ORDER BY p.sku, p.quantity DESC
  ),
  filtrada AS (
    SELECT * FROM base b
     WHERE p_falta IS NULL
        OR (p_falta = 'carros' AND NOT b.con_carros)
        OR (p_falta = 'refaccion' AND b.familia IS NULL)
        OR (p_falta = 'sistema' AND b.sistema IS NULL)
  ),
  pagina AS (
    SELECT b.*, count(*) OVER () AS total FROM filtrada b
     ORDER BY b.quantity > 0 DESC, b.sku
     LIMIT greatest(1, least(p_limit, 200)) OFFSET greatest(0, p_offset)
  )
  SELECT g.id, g.sku, g.name, g.familia, g.familia_nombre, g.sistema, g.brand,
         g.price_cents, g.quantity, g.image_url,
         coalesce((
           SELECT array_agg(c ORDER BY c) FROM (
             SELECT t.veh_modelo || ' ' ||
                    CASE WHEN t.veh_anio_hasta IS NULL OR t.veh_anio_hasta = t.veh_anio_desde
                         THEN right(t.veh_anio_desde::text, 2)
                         ELSE right(t.veh_anio_desde::text, 2) || '–' || right(t.veh_anio_hasta::text, 2) END
                    || coalesce(' ' || pt.cilindrada, '') AS c
               FROM product_tags pt JOIN tags t ON t.id = pt.tag_id
              WHERE pt.product_id = g.id AND t.veh_marca IS NOT NULL
           ) x), '{}') AS carros,
         (SELECT count(*)::int FROM product_tags pt JOIN tags t ON t.id = pt.tag_id
           WHERE pt.product_id = g.id AND t.veh_marca IS NOT NULL) AS n_carros,
         CASE WHEN g.conversion_grupo IS NULL THEN 0 ELSE
           (SELECT count(DISTINCT o.sku)::int FROM products o
             WHERE o.conversion_grupo = g.conversion_grupo AND o.sku <> g.sku) END AS n_conv,
         g.total
    FROM pagina g
   ORDER BY g.quantity > 0 DESC, g.sku;
$$;
REVOKE ALL ON FUNCTION public.catalogo_buscar(text, text, text, text, text, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.catalogo_buscar(text, text, text, text, text, int, int) TO authenticated;

-- "Por completar": what the catalog still lacks, by sku.
CREATE OR REPLACE FUNCTION public.catalogo_pendientes()
RETURNS TABLE (sin_carros bigint, sin_refaccion bigint, sin_sistema bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH b AS (
    SELECT DISTINCT ON (p.sku) p.id, p.familia, coalesce(p.sistema, f.sistema) AS sistema
      FROM products p LEFT JOIN familias f ON f.id = p.familia
     WHERE p.is_active
     ORDER BY p.sku
  )
  SELECT count(*) FILTER (WHERE NOT EXISTS (
           SELECT 1 FROM product_tags pt JOIN tags t ON t.id = pt.tag_id
            WHERE pt.product_id = b.id AND t.veh_marca IS NOT NULL)),
         count(*) FILTER (WHERE b.familia IS NULL),
         count(*) FILTER (WHERE b.sistema IS NULL)
    FROM b;
$$;
REVOKE ALL ON FUNCTION public.catalogo_pendientes() FROM public;
GRANT EXECUTE ON FUNCTION public.catalogo_pendientes() TO authenticated;

-- ---------------------------------------------------------------------------
-- In the auto parts shop the old Línea (CRMST, YSVAR…) is retired: what the
-- register, the store's "Refacción" filter and the inventory show as the kind
-- of part is the owner's refacción. Phone shops keep their own categories.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tags WHERE veh_marca IS NOT NULL) THEN
    UPDATE public.products p SET category = f.nombre
      FROM public.familias f
     WHERE f.id = p.familia AND p.category IS DISTINCT FROM f.nombre;
  END IF;
END $$;
