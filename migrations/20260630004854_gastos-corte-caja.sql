-- Expenses (gastos) for the cash cut (corte de caja). Each row is money that
-- left the business; the corte nets these against sales for the period.
CREATE TABLE public.gastos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concepto    text NOT NULL,
  monto_cents int  NOT NULL CHECK (monto_cents > 0),
  metodo      text NOT NULL DEFAULT 'efectivo'
                CHECK (metodo IN ('efectivo', 'tarjeta', 'transferencia', 'otro')),
  categoria   text,
  created_by  text NOT NULL DEFAULT public.requesting_user_id(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX gastos_created_at_idx ON public.gastos (created_at);

ALTER TABLE public.gastos ENABLE ROW LEVEL SECURITY;

-- Any signed-in staff can see and register expenses; only admins delete.
CREATE POLICY "authenticated read gastos"
  ON public.gastos FOR SELECT TO authenticated
  USING (public.requesting_user_id() IS NOT NULL);

CREATE POLICY "authenticated insert gastos"
  ON public.gastos FOR INSERT TO authenticated
  WITH CHECK (created_by = public.requesting_user_id());

CREATE POLICY "admin delete gastos"
  ON public.gastos FOR DELETE TO authenticated
  USING (public.is_admin());

REVOKE INSERT, UPDATE, DELETE ON public.gastos FROM anon, authenticated;
GRANT  SELECT ON public.gastos TO authenticated;
-- created_by is filled by its DEFAULT (requesting_user_id), so it's not granted.
GRANT  INSERT (concepto, monto_cents, metodo, categoria) ON public.gastos TO authenticated;
GRANT  DELETE ON public.gastos TO authenticated; -- gated by the admin RLS policy
