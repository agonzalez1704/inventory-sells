-- Which suppliers stock a product, at what price, and whose pieces are on the
-- shelf right now.
--
-- Deliberately derived, not a new table. Every fact is already recorded:
-- compra_items joined to compras carries who sold it, when, and for how much,
-- and costo_capas already attributes the REMAINING stock to the purchase it came
-- from — which is what answers "of these 15, five are his and ten are hers".
-- A products_proveedores table would restate that and start drifting the first
-- time a purchase is cancelled.
--
-- products.proveedor_id survives as the preferred supplier: the default when
-- reordering, not the record of who has actually supplied it.
CREATE OR REPLACE FUNCTION public.proveedores_de_producto(p_product_id uuid)
RETURNS TABLE (
  proveedor_id      uuid,
  nombre            text,
  telefono          text,
  lead_time_dias    smallint,
  veces             bigint,
  piezas_compradas  bigint,
  costo_ultimo_cents bigint,
  costo_min_cents   bigint,
  ultima_compra     date,
  piezas_en_stock   bigint
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH compras_del AS (
    SELECT c.proveedor_id, c.fecha_ingreso, i.qty, i.costo_unitario_cents,
           row_number() OVER (PARTITION BY c.proveedor_id
                              ORDER BY c.fecha_ingreso DESC, c.created_at DESC) AS reciente
    FROM public.compra_items i
    JOIN public.compras c ON c.id = i.compra_id
    WHERE i.product_id = p_product_id
      AND c.estado = 'recibida'
  ),
  -- Stock still on the shelf, traced to the purchase that brought it in.
  stock AS (
    SELECT c.proveedor_id, sum(k.qty_restante) AS piezas
    FROM public.costo_capas k
    JOIN public.compras c ON c.id = k.compra_id
    WHERE k.product_id = p_product_id AND k.qty_restante > 0
    GROUP BY c.proveedor_id
  )
  SELECT pr.id, pr.nombre, pr.telefono, pr.lead_time_dias,
         count(*)::bigint,
         sum(cd.qty)::bigint,
         max(cd.costo_unitario_cents) FILTER (WHERE cd.reciente = 1)::bigint,
         min(cd.costo_unitario_cents)::bigint,
         max(cd.fecha_ingreso)::date,
         coalesce(max(s.piezas), 0)::bigint
  FROM compras_del cd
  JOIN public.proveedores pr ON pr.id = cd.proveedor_id
  LEFT JOIN stock s ON s.proveedor_id = cd.proveedor_id
  GROUP BY pr.id, pr.nombre, pr.telefono, pr.lead_time_dias
  ORDER BY min(cd.costo_unitario_cents), pr.nombre;
$$;

GRANT EXECUTE ON FUNCTION public.proveedores_de_producto(uuid) TO authenticated;

-- Pieces on the shelf we cannot attribute: stock that predates purchase
-- tracking (the FIFO backfill seeded layers with no compra_id) or that arrived
-- by adjustment. Reported rather than hidden — claiming a supplier for it would
-- be worse than admitting we don't know.
CREATE OR REPLACE FUNCTION public.stock_sin_origen(p_product_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT coalesce(sum(k.qty_restante), 0)::bigint
  FROM public.costo_capas k
  WHERE k.product_id = p_product_id AND k.qty_restante > 0 AND k.compra_id IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.stock_sin_origen(uuid) TO authenticated;
