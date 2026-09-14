-- Third visibility mode for a credit note: assigned to ONE specific seller.
-- Private = creator only; public = everyone; assigned = creator + that seller.
-- The admin routes the debt to whoever will deal with that customer.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS fiado_asignado_a text;

COMMENT ON COLUMN public.sales.fiado_asignado_a IS
  'Clerk user id del vendedor asignado a cobrar esta nota. Null = sin asignar.';
