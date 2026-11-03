-- Tienda (Ruli): one part number, one product.
--
-- The store grouped parts by brand + refacción + description, the phone shop's
-- "model with qualities". In the auto parts shop five GROB "AMORTIGUADOR DEL.
-- DER." for five different cars showed up as one product with five options,
-- each "A cotizar" and none saying which car it fits. The owner: no matching
-- by description. Rows of the same SKU (one per inventory) still list once.
--
-- Only where the shop is auto parts (vehicle tags exist, the same check as
-- 20261028120000_catalogo-en-app.sql): the phone shop keeps its grouping.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tags WHERE veh_marca IS NOT NULL) THEN
    EXECUTE $ddl$
CREATE OR REPLACE FUNCTION public.tienda_match(p_f jsonb, p_ids uuid[])
 RETURNS TABLE(id uuid, grupo bigint, disponible boolean, ok_cat boolean, ok_marca boolean, ok_cal boolean, ok_marco boolean, ok_stock boolean, ok_veh boolean, ok_tag boolean, ok_sis boolean, sis text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    p.id,
    -- The unit the storefront lists. In the auto parts shop that is one part
    -- number: the same description ("AMORTIGUADOR DEL. DER.") is a different
    -- part for every car, so it must never offer them as options of one item.
    hashtextextended(coalesce(p.sku, p.id::text), 0),
    (p.quantity > 0 OR coalesce(i.es_dropship, false)),
    (NOT (p_f ? 'cat')   OR coalesce((p_f -> 'cat')   ? p.category, false)),
    (NOT (p_f ? 'marca') OR coalesce((p_f -> 'marca') ? p.brand,    false)),
    (NOT (p_f ? 'cal')   OR coalesce((p_f -> 'cal')   ? p.calidad,  false)),
    (NOT (p_f ? 'marco') OR coalesce((p_f -> 'marco') ? p.marco,    false)),
    (NOT coalesce((p_f ->> 'stock')::boolean, false)
       OR p.quantity > 0 OR coalesce(i.es_dropship, false)),
    -- One tag must satisfy make, model and year together: a part tagged
    -- "Nissan Tsuru 1992" and "Ford Lobo 2010" does not fit a Tsuru 2010.
    (NOT (p_f ? 'vmarca' OR p_f ? 'vmodelo' OR p_f ? 'anio') OR EXISTS (
      SELECT 1
        FROM public.product_tags pt
        JOIN public.tags t ON t.id = pt.tag_id
       WHERE pt.product_id = p.id
         AND t.veh_marca IS NOT NULL
         AND (NOT (p_f ? 'vmarca')  OR t.veh_marca  = p_f ->> 'vmarca')
         AND (NOT (p_f ? 'vmodelo') OR t.veh_modelo = p_f ->> 'vmodelo')
         AND (NOT (p_f ? 'anio')
              OR (p_f ->> 'anio')::integer BETWEEN t.veh_anio_desde AND t.veh_anio_hasta)
         -- A version picks its own bands; an unnamed band fits every version
         -- of the years it covers (the year check above still applies).
         AND (NOT (p_f ? 'version') OR t.veh_version = p_f ->> 'version' OR t.veh_version IS NULL))),
    (NOT (p_f ? 'tag') OR EXISTS (
      SELECT 1
        FROM public.product_tags pt
        JOIN public.tags t ON t.id = pt.tag_id
       WHERE pt.product_id = p.id
         AND t.veh_marca IS NULL
         AND (p_f -> 'tag') ? t.nombre)),
    (NOT (p_f ? 'sis') OR coalesce((p_f -> 'sis') ? s.nombre, false)),
    s.nombre
  FROM public.products p
  LEFT JOIN public.inventories i ON i.id = p.inventory_id
  -- The owner's system for the part, else the one its family implies.
  LEFT JOIN public.familias f ON f.id = p.familia
  LEFT JOIN public.sistemas s ON s.id = coalesce(p.sistema, f.sistema)
  WHERE p.is_active
    AND (p_ids IS NULL OR p.id = ANY (p_ids));
$function$;
    $ddl$;
  END IF;
END $do$;
