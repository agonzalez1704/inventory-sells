-- Phone is the customer's business identity (WhatsApp marketing + distinguishing
-- same-name customers). Keep the uuid PK (stable for sales.customer_id FKs and
-- resilient if a customer changes number), but make the phone required and
-- unique by its NORMALIZED digits, so "55 1234 5678" and "5512345678" collide.
DROP INDEX IF EXISTS public.customers_telefono_uidx;

-- At least 10 digits (MX numbers). Applies to new rows; table is empty today.
ALTER TABLE public.customers
  ADD CONSTRAINT customers_telefono_digits_chk
  CHECK (length(regexp_replace(coalesce(telefono, ''), '\D', '', 'g')) >= 10);

ALTER TABLE public.customers ALTER COLUMN telefono SET NOT NULL;

CREATE UNIQUE INDEX customers_telefono_norm_uidx
  ON public.customers ((regexp_replace(telefono, '\D', '', 'g')));
