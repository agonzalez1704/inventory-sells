-- equivalencias_publicar failed from the app with "DELETE requires a WHERE
-- clause": Supabase's API role preloads safeupdate, which refuses a DELETE or
-- UPDATE without WHERE even inside a function. Run by hand (psql) it worked,
-- which is why the local test passed. Same function, the delete spelled out.
CREATE OR REPLACE FUNCTION public.equivalencias_publicar(p_lote uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.equivalencias_carga WHERE lote = p_lote) THEN
    RAISE EXCEPTION 'La carga llegó vacía';
  END IF;
  DELETE FROM public.equivalencias WHERE true;
  INSERT INTO public.equivalencias (grupo, marca, clave, origen)
  SELECT DISTINCT ON (marca, replace(public.normalizar_busqueda(clave), ' ', ''))
         grupo, marca, clave, origen
    FROM public.equivalencias_carga
   WHERE lote = p_lote AND replace(public.normalizar_busqueda(clave), ' ', '') <> ''
   ORDER BY marca, replace(public.normalizar_busqueda(clave), ' ', ''), (origen = 'manual') DESC;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  DELETE FROM public.equivalencias_carga WHERE lote = p_lote OR created_at < now() - interval '1 day';
  RETURN v_n;
END;
$$;
