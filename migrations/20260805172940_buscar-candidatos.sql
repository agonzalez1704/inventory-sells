-- Narrow the catalog to a candidate set the JS scorer can rank.
--
-- lib/search.ts requires EVERY query token to hit something (AND) and expands
-- brand nicknames, so "moto g42" must match a product stored as "MOTOROLA G42"
-- and "motorola g42" must match one stored as "MOTO G42". That is an AND across
-- tokens of an OR across each token's aliases, which the caller passes in
-- already expanded:
--
--   [["motorola","moto"], ["g42"]]
--
-- Built as dynamic SQL rather than a correlated subquery over jsonb: composed
-- literals let the trigram index serve each LIKE, whereas a subquery per row
-- degrades to a sequential scan — exactly what this exists to avoid.
--
-- ponytail: p_limit caps the candidates, so a single very broad token (say
-- "bat" across thousands of batteries) can leave the best match outside the
-- window. Ordering by stock first keeps what the counter can actually sell at
-- the front. Revisit with a real ranking function if that ceiling starts to
-- show.
CREATE OR REPLACE FUNCTION public.buscar_productos_candidatos(
  p_tokens       jsonb,
  p_inventory_id uuid DEFAULT NULL,
  p_categoria    text DEFAULT NULL,
  p_limit        int  DEFAULT 400
)
RETURNS SETOF public.products
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_sql    text := 'SELECT * FROM public.products WHERE is_active';
  v_grupo  jsonb;
  v_ors    text;
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
      SELECT string_agg(format('busqueda LIKE %L', '%' || t || '%'), ' OR ')
        INTO v_ors
        FROM jsonb_array_elements_text(v_grupo) t
       WHERE t <> '';
      IF v_ors IS NOT NULL THEN
        v_sql := v_sql || ' AND (' || v_ors || ')';
      END IF;
    END LOOP;
  END IF;

  -- In-stock first: with a capped window, what the shop can sell today is worth
  -- more than what it merely lists.
  v_sql := v_sql || format(
    ' ORDER BY (quantity > 0) DESC, quantity DESC, name LIMIT %s',
    greatest(1, least(coalesce(p_limit, 400), 2000)));

  RETURN QUERY EXECUTE v_sql;
END;
$$;

GRANT EXECUTE ON FUNCTION public.buscar_productos_candidatos(jsonb, uuid, text, int) TO authenticated;
