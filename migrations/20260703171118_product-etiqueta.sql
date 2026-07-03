-- Optional tag on a product (e.g. stock the warehouse didn't recognize). Tagged
-- products sell normally; the corte de caja splits their revenue out per tag.
-- NULL = normal. Admin-only edit (existing admin UPDATE policy applies).
ALTER TABLE public.products ADD COLUMN etiqueta text;
GRANT UPDATE (etiqueta) ON public.products TO authenticated;
