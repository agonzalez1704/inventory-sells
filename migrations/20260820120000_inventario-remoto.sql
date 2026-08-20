-- An inventory that lives in another city, with its own delivery lead.
--
-- The requirement, verbatim: a customer buys 2 screens from Moca's displays
-- (local) and 5 flexes from Movil House Irapuato, which takes 2 business days
-- to deliver. The days are a property of WHERE the stock sits, so they live on
-- the inventory — not on products (21k rows to maintain) and not in the shop
-- config (which describes the shop, not each warehouse).
--
-- NULL means "ships from the shop itself, no extra days" — the default for
-- every existing inventory, so nothing changes until somebody fills it in.
ALTER TABLE public.inventories
  ADD COLUMN IF NOT EXISTS ciudad text,
  ADD COLUMN IF NOT EXISTS entrega_dias_habiles smallint
    CHECK (entrega_dias_habiles IS NULL OR entrega_dias_habiles >= 0);

COMMENT ON COLUMN public.inventories.entrega_dias_habiles IS
  'Días hábiles EXTRA para que mercancía de este inventario llegue al cliente. NULL = local, sin días extra.';

-- The storefront's grouped listing now carries each variant's lead, so the
-- card can say "+2 días" on the one rung that ships from elsewhere. Same
-- signature, so CREATE OR REPLACE — only the jsonb payload grows.
CREATE OR REPLACE FUNCTION public.tienda_modelos(
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
    SELECT p.*, i.entrega_dias_habiles
      FROM public.products p
      LEFT JOIN public.inventories i ON i.id = p.inventory_id
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
          'disponible', f.quantity > 0,
          'ultima', f.quantity = 1,
          'imagen', f.image_url,
          'entrega_dias', f.entrega_dias_habiles
        )
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
