-- Customer registry: special pricing (per-customer discount), follow-up/CRM,
-- and (later) e-commerce accounts. Staff-managed for now; `email` is reserved
-- for a future storefront login. Discount is a percentage applied to catalog
-- prices when the customer is chosen at the register.
CREATE TABLE public.customers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        text NOT NULL,
  telefono      text,          -- MX phone / WhatsApp, the natural contact key
  email         text,          -- reserved for future e-commerce accounts
  descuento_pct numeric(5,2) NOT NULL DEFAULT 0
                  CHECK (descuento_pct >= 0 AND descuento_pct <= 100),
  tipo          text NOT NULL DEFAULT 'publico'
                  CHECK (tipo IN ('publico', 'mayoreo', 'tecnico')),
  notas         text,
  is_active     boolean NOT NULL DEFAULT true,
  created_by    text NOT NULL DEFAULT public.requesting_user_id(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customers_nombre_idx   ON public.customers (lower(nombre));
CREATE INDEX customers_telefono_idx ON public.customers (telefono);
-- Prevent accidental duplicates on the same phone (nulls allowed / not unique).
CREATE UNIQUE INDEX customers_telefono_uidx
  ON public.customers (telefono) WHERE telefono IS NOT NULL AND telefono <> '';

CREATE TRIGGER customers_touch_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Staff-only app (Clerk allowlist gates the whole app), so any authenticated
-- user may manage customers. Writes go through Server Actions on the
-- user-scoped client; no money moves here, so no SECURITY DEFINER RPC needed.
CREATE POLICY "authenticated read customers"
  ON public.customers FOR SELECT TO authenticated
  USING (public.requesting_user_id() IS NOT NULL);
CREATE POLICY "authenticated insert customers"
  ON public.customers FOR INSERT TO authenticated
  WITH CHECK (public.requesting_user_id() IS NOT NULL);
CREATE POLICY "authenticated update customers"
  ON public.customers FOR UPDATE TO authenticated
  USING (public.requesting_user_id() IS NOT NULL)
  WITH CHECK (public.requesting_user_id() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE ON public.customers TO authenticated;

-- Link sales (incl. fiados) to a customer for follow-up/history. Nullable:
-- walk-in sales stay customer-less. customer_name is kept for legacy/display.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);
CREATE INDEX IF NOT EXISTS sales_customer_idx ON public.sales (customer_id);
