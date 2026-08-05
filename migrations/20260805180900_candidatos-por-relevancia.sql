-- Truncate by relevance instead of by stock. See 20260805180500 for why.
--
-- The cap exists so a broad query ("pantalla", "balata") can't drag the whole
-- catalog into memory. What it truncates by decides which products the scorer
-- is even allowed to consider, so it now orders by how many query tokens appear
-- in the product NAME — the field lib/search.ts weights highest — before
-- falling back to sellable stock and then name.
CREATE OR REPLACE FUNCTION public.buscar_productos_candidatos(
  p_tokens       jsonb,
  p_inventory_id uuid DEFAULT NULL,
  p_categoria    text DEFAULT NULL,
  p_limit        int  DEFAULT 1000
)
RETURNS SETOF public.products
LANGUAGE plpgsql
STABLE
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
      SELECT string_agg(format('busqueda LIKE %L', '%' || t || '%'), ' OR '),
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

GRANT EXECUTE ON FUNCTION public.buscar_productos_candidatos(jsonb, uuid, text, int) TO authenticated;
