-- Payment proofs also belong to adelantos (layaway/special orders): their
-- abonos arrive by transfer exactly like a sale's. A proof now points at ONE
-- owner — a sale or an adelanto, never both, never neither.
ALTER TABLE public.comprobantes_pago
  ALTER COLUMN sale_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS adelanto_id uuid REFERENCES public.adelantos(id) ON DELETE CASCADE;

ALTER TABLE public.comprobantes_pago DROP CONSTRAINT IF EXISTS comprobantes_pago_un_dueno;
ALTER TABLE public.comprobantes_pago ADD CONSTRAINT comprobantes_pago_un_dueno
  CHECK ((sale_id IS NOT NULL) <> (adelanto_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS comprobantes_pago_adelanto_idx
  ON public.comprobantes_pago (adelanto_id) WHERE adelanto_id IS NOT NULL;
