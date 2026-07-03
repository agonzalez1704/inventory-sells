-- Extra income not tied to a product sale (installation, repair labor, etc.).
-- Counts alongside sales in the corte de caja. Mirrors the gastos table.
CREATE TABLE public.ingresos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concepto    text NOT NULL,
  monto_cents int  NOT NULL CHECK (monto_cents > 0),
  metodo      text NOT NULL DEFAULT 'efectivo'
                CHECK (metodo IN ('efectivo', 'tarjeta', 'transferencia', 'otro')),
  categoria   text,
  created_by  text NOT NULL DEFAULT public.requesting_user_id(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ingresos_created_at_idx ON public.ingresos (created_at);

ALTER TABLE public.ingresos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read ingresos"
  ON public.ingresos FOR SELECT TO authenticated
  USING (public.requesting_user_id() IS NOT NULL);

CREATE POLICY "authenticated insert ingresos"
  ON public.ingresos FOR INSERT TO authenticated
  WITH CHECK (created_by = public.requesting_user_id());

CREATE POLICY "admin delete ingresos"
  ON public.ingresos FOR DELETE TO authenticated
  USING (public.is_admin());

REVOKE INSERT, UPDATE, DELETE ON public.ingresos FROM anon, authenticated;
GRANT  SELECT ON public.ingresos TO authenticated;
GRANT  INSERT (concepto, monto_cents, metodo, categoria) ON public.ingresos TO authenticated;
GRANT  DELETE ON public.ingresos TO authenticated; -- gated by the admin RLS policy
