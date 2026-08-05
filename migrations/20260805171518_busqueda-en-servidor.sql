-- Search the catalog in the database instead of in the browser.
--
-- /pos and /inventario ship every active product to the client and filter it
-- there with lib/search.ts. At Fiable's 614 products that is invisible and the
-- search feels instant. The refaccionaria's catalog is 21,033 — roughly 3 MB of
-- JSON on every page load, over a shop's connection, before the till can ring
-- up anything.
--
-- The scoring in lib/search.ts is not reimplemented here. It knows brand
-- nicknames ("moto" → "motorola"), Spanish stopwords, per-field weights and
-- joined spellings, and a SQL translation would drift from it. Instead this
-- index only NARROWS the candidates; the same JS function still ranks them, so
-- results keep their order.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Mirror of normalize() in lib/search.ts: lowercase, strip accents, and reduce
-- anything that isn't a letter or digit to a single space. Marked IMMUTABLE
-- because a generated column may only call immutable functions.
CREATE OR REPLACE FUNCTION public.normalizar_busqueda(p_texto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT regexp_replace(
           lower(translate(p_texto,
             'áéíóúüñÁÉÍÓÚÜÑàèìòùÀÈÌÒÙâêîôûÂÊÎÔÛ',
             'aeiounAEIOUUNaeiouAEIOUaeiouAEIOU')),
           '[^a-z0-9]+', ' ', 'g');
$$;

-- One column holding the spaced form AND the same text with the spaces removed.
-- The compact half is what lets "note12" find "NOTE 12" and "0371210" find
-- "OP-03712101GA" — the JS scorer already does that match, but it never gets the
-- chance if the row isn't among the candidates the database returns.
ALTER TABLE public.products
  ADD COLUMN busqueda text
  GENERATED ALWAYS AS (
    public.normalizar_busqueda(
      coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' ||
      coalesce(brand, '') || ' ' || coalesce(category, '')
    )
    || ' ' ||
    replace(
      public.normalizar_busqueda(
        coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' ||
        coalesce(brand, '') || ' ' || coalesce(category, '')
      ), ' ', '')
  ) STORED;

-- Trigram GIN: the queries are ILIKE '%token%', which no btree index can serve.
CREATE INDEX products_busqueda_trgm
  ON public.products USING gin (busqueda gin_trgm_ops);

-- Category list for the POS filter chips. Cheap to aggregate in SQL, and it
-- stops the client needing the whole catalog just to count them.
CREATE OR REPLACE FUNCTION public.categorias_de_inventario(p_inventory_id uuid DEFAULT NULL)
RETURNS TABLE (categoria text, productos bigint)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT p.category, count(*)
  FROM public.products p
  WHERE p.is_active
    AND p.category IS NOT NULL AND p.category <> ''
    AND (p_inventory_id IS NULL OR p.inventory_id = p_inventory_id)
  GROUP BY p.category
  ORDER BY count(*) DESC, p.category;
$$;

GRANT EXECUTE ON FUNCTION public.categorias_de_inventario(uuid) TO authenticated;
