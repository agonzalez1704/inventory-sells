-- The shop's address, hours, delivery and warranty terms move out of the code.
--
-- lib/tienda-info.ts hard-coded Fiable's: "5 de Mayo #216, León", 30 días de
-- garantía, and the shipping origin the courier quotes from. None of that is
-- brand identity — it is one business's facts, and each business already has
-- its own database. Ruli's storefront would have promised Fiable's counter.
--
-- One jsonb column rather than nine: the app reads the whole object and never
-- filters on a field, `origen` is nested, and nine column-level GRANTs is nine
-- chances to forget one — which is exactly how the supplier form broke.
ALTER TABLE public.config_negocio ADD COLUMN tienda jsonb;

GRANT UPDATE (tienda) ON public.config_negocio TO authenticated;

-- Left NULL on purpose, in both databases.
--
-- Seeding it with the values from the code would put Fiable's address into
-- Ruli's storefront — wrong, and invisible, since it renders perfectly. Fiable
-- is seeded separately with its own real data; anywhere else the storefront
-- shows nothing until somebody fills it in, which is the honest failure.
COMMENT ON COLUMN public.config_negocio.tienda IS
  'Datos públicos de la tienda: dirección, horario, entrega, garantía y origen '
  'de envío. NULL = sin configurar; la tienda omite lo que falte.';
