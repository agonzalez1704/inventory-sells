-- Multiple phones per customer (R4). The PRIMARY phone stays in
-- customers.telefono (existing POS/agent code reads it unchanged);
-- customer_phones holds ADDITIONAL numbers. A phone identifies a customer
-- (WhatsApp detection), so a normalized number may exist only once across
-- BOTH tables — enforced by the unique index here plus two collision guards.
CREATE TABLE public.customer_phones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  telefono    text NOT NULL,
  etiqueta    text,  -- "taller", "oficina", "esposa"…
  created_by  text NOT NULL DEFAULT public.requesting_user_id(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_phones_digits_chk
    CHECK (length(regexp_replace(telefono, '\D', '', 'g')) >= 10)
);

CREATE INDEX customer_phones_customer_idx ON public.customer_phones (customer_id);
CREATE UNIQUE INDEX customer_phones_norm_uidx
  ON public.customer_phones ((regexp_replace(telefono, '\D', '', 'g')));

-- Guard 1: an extra phone must not collide with any customer's PRIMARY phone.
CREATE OR REPLACE FUNCTION public.customer_phones_check_collision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_norm text := regexp_replace(NEW.telefono, '\D', '', 'g');
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.customers
    WHERE regexp_replace(telefono, '\D', '', 'g') = v_norm
  ) THEN
    RAISE EXCEPTION 'phone % already registered as a primary phone', NEW.telefono
      USING errcode = '23505';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER customer_phones_collision
  BEFORE INSERT OR UPDATE OF telefono ON public.customer_phones
  FOR EACH ROW EXECUTE FUNCTION public.customer_phones_check_collision();

-- Guard 2 (mirror): a primary phone must not collide with any extra phone.
CREATE OR REPLACE FUNCTION public.customers_check_phone_collision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_norm text := regexp_replace(NEW.telefono, '\D', '', 'g');
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.customer_phones
    WHERE regexp_replace(telefono, '\D', '', 'g') = v_norm
  ) THEN
    RAISE EXCEPTION 'phone % already registered as an additional phone', NEW.telefono
      USING errcode = '23505';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER customers_phone_collision
  BEFORE INSERT OR UPDATE OF telefono ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_check_phone_collision();

-- Unified lookup: primary + extras, normalized. WhatsApp detection (R2) and
-- any number→customer resolution reads this instead of two queries.
CREATE VIEW public.customer_phones_all AS
  SELECT c.id AS customer_id,
         c.telefono,
         regexp_replace(c.telefono, '\D', '', 'g') AS telefono_norm,
         'principal'::text AS etiqueta,
         true AS es_principal
    FROM public.customers c
  UNION ALL
  SELECT p.customer_id,
         p.telefono,
         regexp_replace(p.telefono, '\D', '', 'g') AS telefono_norm,
         p.etiqueta,
         false AS es_principal
    FROM public.customer_phones p;

-- Same posture as customers: staff-only app, any authenticated user manages.
ALTER TABLE public.customer_phones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read customer_phones"
  ON public.customer_phones FOR SELECT TO authenticated
  USING (public.requesting_user_id() IS NOT NULL);
CREATE POLICY "authenticated insert customer_phones"
  ON public.customer_phones FOR INSERT TO authenticated
  WITH CHECK (public.requesting_user_id() IS NOT NULL);
CREATE POLICY "authenticated delete customer_phones"
  ON public.customer_phones FOR DELETE TO authenticated
  USING (public.requesting_user_id() IS NOT NULL);

GRANT SELECT, INSERT, DELETE ON public.customer_phones TO authenticated;
GRANT SELECT ON public.customer_phones_all TO authenticated;
