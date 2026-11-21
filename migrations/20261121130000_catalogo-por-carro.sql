-- Catálogo por carro: the owner picks Armadora → Modelo (→ versión, año) and
-- reviews/edits every part of that car in place (Ruli, 2026-11-20). Same
-- matching as the POS (piezas_por_vehiculo): one tag must hold make, model and
-- year together; a version takes its own bands plus the unnamed ranges that
-- overlap its years.
--
-- New params have defaults, so the deployed 7-argument call keeps working.
DROP FUNCTION IF EXISTS public.catalogo_buscar(text, text, text, text, text, integer, integer);

CREATE FUNCTION public.catalogo_buscar(p_q text DEFAULT NULL::text, p_sistema text DEFAULT NULL::text, p_familia text DEFAULT NULL::text, p_marca text DEFAULT NULL::text, p_falta text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_vmarca text DEFAULT NULL::text, p_vmodelo text DEFAULT NULL::text, p_version text DEFAULT NULL::text, p_anio integer DEFAULT NULL::integer)
 RETURNS TABLE(id uuid, sku text, name text, familia text, familia_nombre text, sistema text, brand text, price_cents integer, quantity integer, image_url text, carros text[], n_carros integer, n_conv integer, total bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  WITH rango AS (
    -- The years the asked-for version covers, from the tags that carry it.
    SELECT min(t.veh_anio_desde) AS d,
           max(coalesce(t.veh_anio_hasta, t.veh_anio_desde)) AS h
      FROM tags t
     WHERE p_version IS NOT NULL
       AND t.veh_marca = p_vmarca
       AND (p_vmodelo IS NULL OR t.veh_modelo = p_vmodelo)
       AND t.veh_version = p_version
  ),
  base AS (
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
       AND (p_vmarca IS NULL OR EXISTS (
             SELECT 1 FROM product_tags pt JOIN tags t ON t.id = pt.tag_id CROSS JOIN rango r
              WHERE pt.product_id = p.id
                AND t.veh_marca = p_vmarca
                AND (p_vmodelo IS NULL OR t.veh_modelo = p_vmodelo)
                AND (p_version IS NULL OR t.veh_version = p_version
                     OR (t.veh_version IS NULL AND (t.veh_anio_desde IS NULL OR r.d IS NULL
                         OR (t.veh_anio_desde < r.h AND coalesce(t.veh_anio_hasta, t.veh_anio_desde) > r.d))))
                AND (p_anio IS NULL OR t.veh_anio_desde IS NULL
                     OR p_anio BETWEEN t.veh_anio_desde AND coalesce(t.veh_anio_hasta, t.veh_anio_desde))))
     ORDER BY p.sku, p.created_at, p.id
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
$function$;

REVOKE EXECUTE ON FUNCTION public.catalogo_buscar(text, text, text, text, text, integer, integer, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalogo_buscar(text, text, text, text, text, integer, integer, text, text, text, integer) TO authenticated;
