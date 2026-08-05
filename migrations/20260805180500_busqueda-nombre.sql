-- Rank candidates by name match, not by stock.
--
-- buscar_productos_candidatos caps how many rows it hands the scorer. That cap
-- decides which products the scorer never gets to consider, so the order it
-- truncates by has to correlate with the final ranking — and stock does not.
-- Measured against Fiable's 614 products, "pantalla" and "motorola" already
-- returned a different top 30 than scoring the whole catalog did. At 21k it
-- would be routine.
--
-- lib/search.ts weights a hit in the name (3) above sku or brand (2), so the
-- number of query tokens found in the NAME is a cheap, well-correlated proxy.
-- This column holds the name alone, normalised the same way as `busqueda`.
ALTER TABLE public.products
  ADD COLUMN busqueda_nombre text
  GENERATED ALWAYS AS (
    public.normalizar_busqueda(coalesce(name, ''))
    || ' ' ||
    replace(public.normalizar_busqueda(coalesce(name, '')), ' ', '')
  ) STORED;

CREATE INDEX products_busqueda_nombre_trgm
  ON public.products USING gin (busqueda_nombre gin_trgm_ops);
