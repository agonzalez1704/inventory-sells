-- Group the storefront by phone model, not by SKU.
--
-- The same repair is listed as separate products: an iPhone 13 screen is "13 HD
-- INCELL" at $280, "13 OLED" at $810 and "13 ORG" at $2,080. Three cards, three
-- cryptic names, and nothing anywhere explaining why one costs 7.4x the other.
-- The customer is not choosing a product, they are choosing how much to spend on
-- a repair, and the catalogue was hiding the only comparison that matters.
--
-- The model key is a GENERATED column rather than an expression in the listing
-- function, because the storefront reads products two ways — browsing through
-- tienda_lista, and searching through buscar_productos_candidatos, which returns
-- SETOF products. A column is picked up by both for free; the same regex written
-- into two functions is the drift this schema keeps having to undo.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS modelo text
  GENERATED ALWAYS AS (
    btrim(regexp_replace(
      upper(name),
      '\s*(HD\s+)?(INCELL|OLED|ORG|ORIGINAL|AAA|GX\s+AMOLED|AMOLED|JK|C/M|W/F|FULL\s+HD|HD)\s*$',
      '', 'g'))
  ) STORED;

CREATE INDEX IF NOT EXISTS products_modelo_idx
  ON public.products (brand, category, modelo) WHERE is_active;

-- A new function rather than a changed tienda_lista: the running storefront
-- reads the old shape, and renaming what an RPC returns breaks production before
-- the new code reaches it. tienda_lista is dropped once this is deployed.
DROP FUNCTION IF EXISTS public.tienda_modelos(text, text, text, integer, integer);
CREATE FUNCTION public.tienda_modelos(
  p_marca     text,
  p_categoria text,
  p_calidad   text,
  p_limit     integer,
  p_offset    integer
)
RETURNS TABLE (
  modelo      text,
  brand       text,
  category    text,
  imagen      text,
  desde_cents integer,
  variantes   jsonb,
  -- Which variant this shop actually sells, from its own sales. Null when the
  -- model has no history: a badge nobody earned is a claim, and the shop's
  -- credibility is worth more than the nudge.
  mas_vendida uuid,
  total       bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH vendidas AS (
    SELECT si.product_id, sum(si.qty) AS piezas
      FROM public.sale_items si
      JOIN public.sales s ON s.id = si.sale_id AND s.status = 'completed'
     GROUP BY si.product_id
  ),
  filtrados AS (
    SELECT p.*
      FROM public.products p
     WHERE p.is_active
       AND (p_marca     IS NULL OR p.brand    = p_marca)
       AND (p_categoria IS NULL OR p.category = p_categoria)
       AND (p_calidad   IS NULL OR p.calidad  = p_calidad)
  ),
  agrupados AS (
    SELECT
      f.modelo,
      f.brand,
      f.category,
      -- The first photo any variant has: they are the same part, so a picture of
      -- one is a picture of all, and most variants carry none.
      (array_remove(array_agg(f.image_url ORDER BY f.image_url), NULL))[1] AS imagen,
      min(f.price_cents) FILTER (WHERE f.price_cents > 0) AS desde_cents,
      max((f.quantity > 0)::int) AS hay_stock,
      max((f.price_cents > 0)::int) AS hay_precio,
      jsonb_agg(
        jsonb_build_object(
          'id', f.id,
          'nombre', f.name,
          'calidad', f.calidad,
          'precio_cents', f.price_cents,
          'existencia', f.quantity,
          'imagen', f.image_url
        )
        -- Cheapest first: the ladder is read upwards, and the entry price is
        -- what decides whether the customer keeps reading at all.
        ORDER BY f.price_cents, f.name
      ) AS variantes,
      (array_agg(f.id ORDER BY coalesce(v.piezas, 0) DESC, f.price_cents))[1] AS mejor,
      max(coalesce(v.piezas, 0)) AS piezas_top
    FROM filtrados f
    LEFT JOIN vendidas v ON v.product_id = f.id
    GROUP BY f.modelo, f.brand, f.category
  )
  SELECT a.modelo, a.brand, a.category, a.imagen, a.desde_cents, a.variantes,
         CASE WHEN a.piezas_top > 0 THEN a.mejor END AS mas_vendida,
         count(*) OVER () AS total
    FROM agrupados a
   ORDER BY a.hay_stock DESC, a.hay_precio DESC, a.modelo
   LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.tienda_modelos(text, text, text, integer, integer) TO anon, authenticated;
