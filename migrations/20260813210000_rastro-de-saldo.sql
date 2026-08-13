-- The story behind each movement, not just its amount.
--
-- "Se abonaron $190" answers nothing anybody asks. The question at the counter
-- is "why does this person have credit", and the answer is a part, a quantity,
-- a reason and the sale it came from — which the chain already records and the
-- reader was throwing away.
--
-- DROP first: adding columns changes the return type and CREATE OR REPLACE
-- refuses it, leaving the old signature live and the screen asking for columns
-- that do not exist.
DROP FUNCTION IF EXISTS public.movimientos_de_saldo(uuid);

CREATE FUNCTION public.movimientos_de_saldo(p_customer_id uuid)
RETURNS TABLE (
  id           uuid,
  monto_cents  int,
  origen       text,
  motivo       text,
  created_at   timestamptz,
  -- The part, for a credit. NULL on a spend.
  pieza        text,
  sku          text,
  qty          int,
  -- Where to go to see it: the sale the warranty came out of, or the sale that
  -- spent the credit. Both are sales, so one column serves.
  sale_id      uuid,
  garantia_id  uuid,
  -- A partial warranty is the norm — three sold, one returned — so the line has
  -- to say how many of how many, or the amount looks arbitrary.
  vendidas     int
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT m.id, m.monto_cents, m.origen, m.motivo, m.created_at,
         p.name, p.sku, g.qty,
         coalesce(g.sale_id, m.sale_id),
         m.garantia_id,
         si.qty
    FROM public.saldo_movimientos m
    LEFT JOIN public.garantias_cliente g ON g.id = m.garantia_id
    LEFT JOIN public.products p ON p.id = g.product_id
    LEFT JOIN public.sale_items si
           ON si.sale_id = g.sale_id AND si.product_id = g.product_id
   WHERE m.customer_id = p_customer_id
   ORDER BY m.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.movimientos_de_saldo(uuid) TO authenticated;
