-- Proof of payment for transfers: the reference text and/or the screenshot the
-- customer shows at the counter. One row per payment event, attached to the
-- sale — a fiado can accumulate several (one per abono). Images live in the
-- PRIVATE "comprobantes" bucket (created via API, not SQL) and are served with
-- short-lived signed URLs: a payment proof is not a product photo.
CREATE TABLE IF NOT EXISTS public.comprobantes_pago (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  referencia text,
  imagen_key text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (referencia IS NOT NULL OR imagen_key IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS comprobantes_pago_sale_idx ON public.comprobantes_pago (sale_id);

ALTER TABLE public.comprobantes_pago ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "authenticated read comprobantes_pago" ON public.comprobantes_pago
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT ON public.comprobantes_pago TO authenticated;
