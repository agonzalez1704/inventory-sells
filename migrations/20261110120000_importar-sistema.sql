-- A spreadsheet's "Sistema" column (Guadalajara's colisión file) now classifies
-- the part. The system belongs to the part, not to the row: the catalog reads
-- the oldest row of a SKU, so a file loaded into Guadalajara must reach
-- Mostrador's copy too, or the part still shows as unclassified there.
-- Same rule as brand: only fills a blank, except in catalogo mode. Values that
-- are not a system of the catalog ("Mecánica") are ignored.
DO $do$
DECLARE
  d text;
  ancla constant text := E'      v_inserted := v_inserted + 1;\n    END IF;\n';
BEGIN
  d := pg_get_functiondef('public.commit_import(jsonb,text,text,uuid,text)'::regprocedure);
  IF position('importar_sistema' IN d) > 0 THEN RETURN; END IF;
  IF (length(d) - length(replace(d, ancla, ''))) / length(ancla) <> 1 THEN
    RAISE EXCEPTION 'commit_import cambió: no encontré el cierre del alta';
  END IF;
  d := regexp_replace(d, 'DECLARE', E'DECLARE\n  v_sistema text;');
  d := replace(d, ancla, ancla || $blk$
    -- importar_sistema: classify the whole part from the file's Sistema column.
    IF p_modo <> 'precios' AND COALESCE(v_row->>'sistema', '') <> '' THEN
      SELECT s.id INTO v_sistema FROM public.sistemas s
       WHERE s.id = translate(lower(trim(v_row->>'sistema')), 'áéíóúüñ', 'aeiouun')
          OR translate(lower(s.nombre), 'áéíóúüñ', 'aeiouun') = translate(lower(trim(v_row->>'sistema')), 'áéíóúüñ', 'aeiouun')
       LIMIT 1;
      IF v_sistema IS NOT NULL THEN
        UPDATE public.products SET sistema = v_sistema
         WHERE sku = v_row->>'sku'
           AND (p_modo = 'catalogo' OR sistema IS NULL)
           AND sistema IS DISTINCT FROM v_sistema;
      END IF;
    END IF;
$blk$);
  EXECUTE d;
END $do$;
