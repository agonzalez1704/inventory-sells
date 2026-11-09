-- A row inheriting its catalog must also inherit familia_fija: the row's name
-- changes in the same UPDATE, and products_familia re-derives familia from the
-- name unless the row is marked fixed — undoing a refacción chosen by hand.
DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.commit_import(jsonb,text,text,uuid,text)'::regprocedure);
  IF position('familia_fija = o.familia_fija' IN d) > 0 THEN RETURN; END IF;
  IF position('familia = o.familia,' IN d) = 0 THEN
    RAISE EXCEPTION 'commit_import cambió: no encontré la herencia de familia';
  END IF;
  EXECUTE replace(d, 'familia = o.familia,', E'familia = o.familia,\n        familia_fija = o.familia_fija,');
END $do$;
