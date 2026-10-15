-- Partial bank deposits from the drawer. Cash leaves the drawer but nothing
-- was spent: it is the same money, now in an account. Modelled as a gasto
-- with a destination account and a proof, so every cash report that already
-- subtracts gastos keeps being right; the corte reads cuenta_id to show the
-- deposit apart from real expenses and under "Debe llegar a cada cuenta".
ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS cuenta_id uuid REFERENCES public.cuentas_negocio(id),
  ADD COLUMN IF NOT EXISTS referencia text,
  ADD COLUMN IF NOT EXISTS comprobante_key text;

CREATE INDEX IF NOT EXISTS gastos_cuenta_id_idx ON public.gastos (cuenta_id) WHERE cuenta_id IS NOT NULL;
