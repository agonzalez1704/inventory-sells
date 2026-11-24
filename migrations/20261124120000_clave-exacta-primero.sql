-- A part code typed whole has to survive the candidate cap.
--
-- "10-009" normalizes to two tokens, "10" and "009". Across every inventory
-- (~70k products) both are substrings of thousands of rows — model years
-- 2009/2010, ranges like "07-10", other codes — so the filter matched far more
-- than the 1000 candidates the app asks for. The order then put rows with the
-- tokens in their NAME first and in-stock rows next; BRAZO COMPENSADOR 10-009
-- has neither, so it was cut before the JS scorer ever saw it. Filtered to one
-- inventory the set fit under the cap, which is why it appeared in CEDIS LEON
-- and vanished under "Todos" and in the store.
--
-- The fix: a row whose SKU, compacted, equals the query compacted ranks above
-- everything else. The query's compact form is the first term of each token
-- group (expand() puts the literal token first), joined. Same signature, so
-- every caller — inventory, register, purchases, store, analytics — gets it.
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
  v_clave   text := '';
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
      v_clave := v_clave || coalesce(v_grupo ->> 0, '');
    END LOOP;
  END IF;

  v_sql := v_sql || ' ORDER BY ';
  -- No query, no code: an empty v_clave would float every SKU-less row up.
  IF v_clave <> '' THEN
    v_sql := v_sql || format(
      '(replace(public.normalizar_busqueda(coalesce(sku, %L)), %L, %L) = %L) DESC, ',
      '', ' ', '', v_clave);
  END IF;
  v_sql := v_sql || format(
    '(%s) DESC, (quantity > 0) DESC, name LIMIT %s',
    v_puntos, greatest(1, least(coalesce(p_limit, 1000), 5000)));

  RETURN QUERY EXECUTE v_sql;
END;
$$;
