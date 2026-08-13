-- Balances for the customer list, and the movements behind one.
--
-- saldo_de_cliente answers for one customer, which is right at the register and
-- useless for a list — calling it per row is one round trip per customer. These
-- two are what a screen needs: everyone who is owed something, and the trail
-- behind a single balance.

-- Only non-zero: a shop with 300 customers and 4 balances should carry 4 rows.
CREATE OR REPLACE FUNCTION public.saldos_de_clientes()
RETURNS TABLE (customer_id uuid, saldo_cents bigint)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT customer_id, sum(monto_cents)::bigint
    FROM public.saldo_movimientos
   GROUP BY customer_id
  HAVING sum(monto_cents) <> 0;
$$;

GRANT EXECUTE ON FUNCTION public.saldos_de_clientes() TO authenticated;

-- The trail: what put the credit there and what spent it. Every row names its
-- source document, because that is the whole point of the ledger — a balance
-- nobody can explain is a balance nobody trusts.
CREATE OR REPLACE FUNCTION public.movimientos_de_saldo(p_customer_id uuid)
RETURNS TABLE (
  id          uuid,
  monto_cents int,
  origen      text,
  motivo      text,
  created_at  timestamptz,
  -- What it came out of, in words: the part under warranty, or the sale.
  detalle     text
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT m.id, m.monto_cents, m.origen, m.motivo, m.created_at,
         CASE
           WHEN m.origen = 'garantia' THEN
             coalesce((SELECT p.name
                         FROM public.garantias_cliente g
                         JOIN public.products p ON p.id = g.product_id
                        WHERE g.id = m.garantia_id), 'Garantía')
           ELSE
             'Venta ' || upper(left(m.sale_id::text, 8))
         END
    FROM public.saldo_movimientos m
   WHERE m.customer_id = p_customer_id
   ORDER BY m.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.movimientos_de_saldo(uuid) TO authenticated;
