-- Sale price = supplier list price (Grob's "P.L.") × a factor the owner sets
-- once per supplier: { "grob": 0.93 }. Kept so the monthly list is "upload and
-- apply" with no question asked twice.
ALTER TABLE public.config_negocio
  ADD COLUMN IF NOT EXISTS factores_lista jsonb NOT NULL DEFAULT '{}'::jsonb;
