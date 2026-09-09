-- Supplier payments grow two audit trails the counter asked for:
-- 1. the transfer screenshot (same private bucket as customer proofs), and
-- 2. WHICH line items a payment covers — "these $3,850 pay the Flip and one
--    flex" — so a partially paid invoice says per item what is still owed.
ALTER TABLE public.compra_pagos ADD COLUMN IF NOT EXISTS imagen_key text;
ALTER TABLE public.compra_pagos ADD COLUMN IF NOT EXISTS detalle jsonb;
ALTER TABLE public.compra_items ADD COLUMN IF NOT EXISTS pagado_cents integer NOT NULL DEFAULT 0;
