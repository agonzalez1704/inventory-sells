-- Carry the proposal and who reported it. The approver's first question is
-- what the customer asked for and who took it in.
--
-- DROP first, as always with a return-type change.
DROP FUNCTION IF EXISTS public.listar_garantias_cliente(int);

CREATE FUNCTION public.listar_garantias_cliente(p_limite int DEFAULT 100)
RETURNS TABLE (
  id              uuid,
  sale_id         uuid,
  cliente         text,
  customer_id     uuid,
  product_id      uuid,
  pieza           text,
  sku             text,
  qty             int,
  monto_cents     int,
  motivo          text,
  reingresa_stock boolean,
  estado          text,
  resolucion      text,
  resolucion_propuesta text,
  reportada_por   text,
  created_at      timestamptz,
  resuelta_at     timestamptz,
  garantia_proveedor_id uuid,
  proveedor       text
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT g.id, g.sale_id, c.nombre, g.customer_id, g.product_id, p.name, p.sku, g.qty,
         g.monto_cents, g.motivo, g.reingresa_stock, g.estado, g.resolucion,
         g.resolucion_propuesta, quien.full_name,
         g.created_at, g.resuelta_at, g.garantia_proveedor_id, pr.nombre
    FROM public.garantias_cliente g
    JOIN public.customers c ON c.id = g.customer_id
    JOIN public.products  p ON p.id = g.product_id
    LEFT JOIN public.profiles quien ON quien.id = g.created_by
    LEFT JOIN public.garantias_proveedor gp ON gp.id = g.garantia_proveedor_id
    LEFT JOIN public.proveedores pr ON pr.id = gp.proveedor_id
   ORDER BY (g.estado = 'pendiente') DESC, g.created_at DESC
   LIMIT greatest(1, least(coalesce(p_limite, 100), 500));
$$;

GRANT EXECUTE ON FUNCTION public.listar_garantias_cliente(int) TO authenticated;
