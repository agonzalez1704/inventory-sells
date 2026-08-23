-- Credit terms live on the customer: how many days they get, and up to how
-- much. Both nullable — NULL means no formal credit line, which is every
-- existing customer until somebody grants one.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS credito_dias smallint
    CHECK (credito_dias IS NULL OR credito_dias > 0),
  ADD COLUMN IF NOT EXISTS credito_limite_cents bigint
    CHECK (credito_limite_cents IS NULL OR credito_limite_cents > 0);

COMMENT ON COLUMN public.customers.credito_dias IS
  'Plazo en días de sus notas de crédito. NULL = sin línea formal.';
COMMENT ON COLUMN public.customers.credito_limite_cents IS
  'Máximo que puede deber en notas de crédito. NULL = sin tope.';

-- What one customer's relationship with the shop looks like, in numbers:
-- everything they have bought, and what they still owe. The debt is the sum of
-- their pending notes minus every abono against those notes — the same
-- arithmetic /fiados does per note, aggregated per person.
CREATE OR REPLACE FUNCTION public.resumen_cliente(p_customer_id uuid)
RETURNS TABLE (
  comprado_cents   bigint,
  compras          integer,
  ultima_compra    timestamptz,
  deuda_cents      bigint,
  notas_pendientes integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT
    coalesce(sum(s.total_cents) FILTER (WHERE s.status = 'completed'), 0),
    count(*) FILTER (WHERE s.status = 'completed')::integer,
    max(s.created_at) FILTER (WHERE s.status = 'completed'),
    coalesce(sum(
      s.total_cents - coalesce((
        SELECT sum(sp.monto_cents) FROM public.sale_pagos sp WHERE sp.sale_id = s.id
      ), 0)
    ) FILTER (WHERE s.status = 'pending'), 0),
    count(*) FILTER (WHERE s.status = 'pending')::integer
  FROM public.sales s
  WHERE s.customer_id = p_customer_id;
$$;

GRANT EXECUTE ON FUNCTION public.resumen_cliente(uuid) TO authenticated;
