-- Import mode "precios": a supplier's list that refreshes cost and price of the
-- parts we already have (name, stock and the rest untouched) and creates the
-- ones we don't, WITH the file's stock — nothing to lose on a new part.
--
-- Patched into the live function instead of restating it: three exact
-- fragments, and the block fails loudly if any of them moved.
DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.commit_import(jsonb,text,text,uuid,text)'::regprocedure);
  IF position('''precios''' IN d) > 0 THEN RETURN; END IF;

  IF position($s$p_modo NOT IN ('alta', 'espejo', 'catalogo')$s$ IN d) = 0
     OR position('    IF FOUND THEN' IN d) = 0
     OR position($s$WHEN 'espejo'   THEN v_qty - COALESCE(v_existing.quantity, 0)$s$ IN d) = 0 THEN
    RAISE EXCEPTION 'commit_import cambió: no pude agregar el modo precios';
  END IF;

  d := replace(d, $s$p_modo NOT IN ('alta', 'espejo', 'catalogo')$s$,
                  $s$p_modo NOT IN ('alta', 'espejo', 'catalogo', 'precios')$s$);
  d := replace(d, '    IF FOUND THEN', $s$    IF FOUND AND p_modo = 'precios' THEN
      UPDATE public.products SET
        cost_cents  = COALESCE((v_row->>'cost_cents')::int, cost_cents),
        price_cents = COALESCE((v_row->>'price_cents')::int, price_cents)
      WHERE id = v_existing.id;
      v_product_id := v_existing.id;
      v_updated := v_updated + 1;
    ELSIF FOUND THEN$s$);
  d := replace(d, $s$WHEN 'espejo'   THEN v_qty - COALESCE(v_existing.quantity, 0)$s$,
                  $s$WHEN 'espejo'   THEN v_qty - COALESCE(v_existing.quantity, 0)
                 WHEN 'precios'  THEN CASE WHEN v_existing.id IS NULL THEN v_qty ELSE 0 END$s$);
  EXECUTE d;
END $do$;
