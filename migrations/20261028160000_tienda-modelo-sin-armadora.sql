-- Tienda: "Modelo" without "Armadora". With no make chosen the facets also
-- list every make|model pair (tipo 'vmm'); picking one sets both filters.
CREATE OR REPLACE FUNCTION public.tienda_facetas_ctx(p_f jsonb, p_ids uuid[])
 RETURNS TABLE(tipo text, valor text, n bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY EXECUTE $q$
    WITH j AS MATERIALIZED (
      SELECT m.*, p.category, p.brand, p.calidad, p.marco
        FROM public.tienda_match($1, $2) m
        JOIN public.products p ON p.id = m.id
    ),
    vt AS (
      SELECT j.grupo, t.veh_marca, t.veh_modelo, t.veh_anio_desde, t.veh_anio_hasta, t.veh_version
        FROM j
        JOIN public.product_tags pt ON pt.product_id = j.id
        JOIN public.tags t ON t.id = pt.tag_id AND t.veh_marca IS NOT NULL
       WHERE j.ok_cat AND j.ok_marca AND j.ok_cal AND j.ok_marco AND j.ok_stock AND j.ok_tag AND j.ok_sis
    )
    SELECT 'total'::text, NULL::text, count(DISTINCT grupo) FROM j
     WHERE ok_cat AND ok_marca AND ok_cal AND ok_marco AND ok_stock AND ok_veh AND ok_tag AND ok_sis
    UNION ALL
    SELECT 'stock', NULL, count(DISTINCT grupo) FROM j
     WHERE disponible AND ok_cat AND ok_marca AND ok_cal AND ok_marco AND ok_veh AND ok_tag AND ok_sis
    UNION ALL
    SELECT 'cat', category, count(DISTINCT grupo) FILTER (
             WHERE ok_marca AND ok_cal AND ok_marco AND ok_stock AND ok_veh AND ok_tag AND ok_sis)
      FROM j WHERE category IS NOT NULL AND category <> '' GROUP BY category
    UNION ALL
    SELECT 'marca', brand, count(DISTINCT grupo) FILTER (
             WHERE ok_cat AND ok_cal AND ok_marco AND ok_stock AND ok_veh AND ok_tag AND ok_sis)
      FROM j WHERE brand IS NOT NULL AND brand <> '' GROUP BY brand
    UNION ALL
    SELECT 'cal', calidad, count(DISTINCT grupo) FILTER (
             WHERE ok_cat AND ok_marca AND ok_marco AND ok_stock AND ok_veh AND ok_tag AND ok_sis)
      FROM j WHERE calidad IS NOT NULL GROUP BY calidad
    UNION ALL
    SELECT 'marco', marco, count(DISTINCT grupo) FILTER (
             WHERE ok_cat AND ok_marca AND ok_cal AND ok_stock AND ok_veh AND ok_tag AND ok_sis)
      FROM j WHERE marco IS NOT NULL GROUP BY marco
    UNION ALL
    SELECT 'vmarca', veh_marca, count(DISTINCT grupo) FROM vt GROUP BY veh_marca
    UNION ALL
    SELECT 'vmodelo', veh_modelo, count(DISTINCT grupo) FROM vt
     WHERE $1 ? 'vmarca' AND veh_marca = $1 ->> 'vmarca' AND veh_modelo IS NOT NULL
     GROUP BY veh_modelo
    UNION ALL
    -- No armadora chosen yet: every model with its make ("Nissan|Versa"), so
    -- the customer can go straight to the car and the make fills itself.
    SELECT 'vmm', veh_marca || '|' || veh_modelo, count(DISTINCT grupo) FROM vt
     WHERE NOT $1 ? 'vmarca' AND veh_modelo IS NOT NULL
     GROUP BY veh_marca, veh_modelo
    UNION ALL
    SELECT 'anio', y::text, count(DISTINCT grupo)
      FROM vt, generate_series(veh_anio_desde, veh_anio_hasta) y
     WHERE $1 ? 'vmodelo' AND veh_marca = $1 ->> 'vmarca' AND veh_modelo = $1 ->> 'vmodelo'
     GROUP BY y
    UNION ALL
    SELECT 'tag', t.nombre, count(DISTINCT j.grupo)
      FROM j
      JOIN public.product_tags pt ON pt.product_id = j.id
      JOIN public.tags t ON t.id = pt.tag_id AND t.veh_marca IS NULL
     WHERE j.ok_cat AND j.ok_marca AND j.ok_cal AND j.ok_marco AND j.ok_stock AND j.ok_veh AND j.ok_sis
     GROUP BY t.nombre
    UNION ALL
    -- Systems ignore their own selection, like every list filter.
    SELECT 'sis', sis, count(DISTINCT grupo) FILTER (
             WHERE ok_cat AND ok_marca AND ok_cal AND ok_marco AND ok_stock AND ok_veh AND ok_tag)
      FROM j WHERE sis IS NOT NULL GROUP BY sis
    UNION ALL
    -- The versions of the chosen model (and year, when there is one). The
    -- panel shows the choice only when there is more than one.
    SELECT 'version', veh_version, count(DISTINCT grupo) FROM vt
     WHERE $1 ? 'vmodelo' AND veh_marca = $1 ->> 'vmarca' AND veh_modelo = $1 ->> 'vmodelo'
       AND veh_version IS NOT NULL
       AND (NOT $1 ? 'anio' OR ($1 ->> 'anio')::integer BETWEEN veh_anio_desde AND veh_anio_hasta)
     GROUP BY veh_version
  $q$ USING p_f, p_ids;
END;
$function$;
