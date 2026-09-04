-- Business bank accounts: when a transfer comes in, the shop wants to record
-- WHICH of its accounts received it. The account rides on the comprobante —
-- the row that already represents "a transfer happened" at every touchpoint
-- (POS, fiados, adelantos, edit-sale, the public order page) — instead of
-- threading a new argument through every payment RPC.

CREATE TABLE IF NOT EXISTS public.cuentas_negocio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Key into the app's bank catalog (bbva, banorte, nu, ...); drives the icon.
  banco text NOT NULL,
  -- What the staff calls it: "BBVA Antonio", "Banorte negocio".
  alias text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.comprobantes_pago
  ADD COLUMN IF NOT EXISTS cuenta_id uuid REFERENCES public.cuentas_negocio(id);
