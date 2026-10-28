-- The catalog screen's pick lists: part brands, and every make with its
-- models (so a typed "Toledoo" can be told it is not a model we know).
CREATE OR REPLACE FUNCTION public.catalogo_marcas()
RETURNS TABLE (brand text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT brand FROM public.products
   WHERE is_active AND brand IS NOT NULL AND brand <> ''
   GROUP BY brand ORDER BY count(*) DESC, brand LIMIT 300;
$$;

CREATE OR REPLACE FUNCTION public.catalogo_vehiculos()
RETURNS TABLE (marca text, modelo text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT DISTINCT veh_marca, veh_modelo FROM public.tags
   WHERE veh_marca IS NOT NULL AND veh_modelo IS NOT NULL
   ORDER BY 1, 2;
$$;

REVOKE ALL ON FUNCTION public.catalogo_marcas() FROM public;
REVOKE ALL ON FUNCTION public.catalogo_vehiculos() FROM public;
GRANT EXECUTE ON FUNCTION public.catalogo_marcas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.catalogo_vehiculos() TO authenticated;
