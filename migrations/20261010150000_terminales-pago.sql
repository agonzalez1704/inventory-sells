-- Card terminals: which one took the payment, what it charges, where it pays.
--
-- A card sale left no trace of the terminal, so the corte could say how much
-- came in by card but not what each terminal keeps as commission nor how much
-- should land in each account — the number to check against the bank.
--
-- The terminal rides on the sale (and on the adelanto), set right after the
-- charge like a transfer's account rides on its comprobante: no payment RPC
-- changes, and a failure to record it never undoes a sale. The commission is
-- snapshotted onto the sale, so changing a terminal's rate does not rewrite
-- last month's corte.

CREATE TABLE IF NOT EXISTS public.terminales_pago (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- What the counter calls it: "Clip mostrador", "Point Panorama".
  nombre       text NOT NULL CHECK (btrim(nombre) <> ''),
  -- Key into the app's bank/processor catalog (bbva, clip, mercadopago, otro):
  -- drives the icon. The name says the rest.
  procesador   text NOT NULL DEFAULT 'otro',
  comision_pct numeric(6,3) NOT NULL DEFAULT 0 CHECK (comision_pct >= 0 AND comision_pct < 100),
  -- Mexican processors charge 16% IVA on top of their commission.
  iva_comision boolean NOT NULL DEFAULT true,
  cuenta_id    uuid REFERENCES public.cuentas_negocio(id) ON DELETE SET NULL,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.terminales_pago ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "authenticated read terminales_pago" ON public.terminales_pago
    FOR SELECT TO authenticated USING (public.requesting_user_id() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT ON public.terminales_pago TO authenticated;

-- The commission actually applied, IVA included (3.6% + IVA = 4.176): what
-- the corte subtracts, frozen at the time of the charge.
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS terminal_id uuid REFERENCES public.terminales_pago(id) ON DELETE SET NULL;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS terminal_comision_pct numeric(7,4);
ALTER TABLE public.adelantos ADD COLUMN IF NOT EXISTS terminal_id uuid REFERENCES public.terminales_pago(id) ON DELETE SET NULL;
ALTER TABLE public.adelantos ADD COLUMN IF NOT EXISTS terminal_comision_pct numeric(7,4);

CREATE INDEX IF NOT EXISTS sales_terminal_idx ON public.sales (terminal_id) WHERE terminal_id IS NOT NULL;
