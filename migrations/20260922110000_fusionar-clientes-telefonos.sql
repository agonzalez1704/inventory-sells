-- fusionar_clientes v2: move the phones instead of copying them.
--
-- customer_phones has a UNIQUE index on the normalized digits across the whole
-- table, so inserting the absorbed row's numbers on the survivor collided with
-- the very rows it was about to delete. They are re-pointed instead, and the
-- duplicates (the same phone written with and without the 52 prefix) are
-- dropped first. The absorbed row's own telefono is added as an extra number,
-- skipped when some other customer already holds it.

CREATE OR REPLACE FUNCTION public.fusionar_clientes(
  p_conservar uuid,
  p_absorber  uuid
)
RETURNS TABLE (ventas int, cotizaciones int, saldo_movs int, garantias int, telefonos int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_c public.customers%ROWTYPE;
  v_a public.customers%ROWTYPE;
  n_ventas int := 0;
  n_cotiz  int := 0;
  n_saldo  int := 0;
  n_gar    int := 0;
  n_tel    int := 0;
  n_extra  int := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'solo un administrador puede combinar clientes' USING errcode = '42501';
  END IF;
  IF p_conservar IS NULL OR p_absorber IS NULL OR p_conservar = p_absorber THEN
    RAISE EXCEPTION 'elige dos clientes distintos' USING errcode = '23514';
  END IF;

  -- Locked in id order: two tills merging the same pair must not deadlock.
  PERFORM 1 FROM public.customers WHERE id IN (p_conservar, p_absorber) ORDER BY id FOR UPDATE;
  SELECT * INTO v_c FROM public.customers WHERE id = p_conservar;
  IF NOT FOUND THEN RAISE EXCEPTION 'cliente no encontrado' USING errcode = '23514'; END IF;
  SELECT * INTO v_a FROM public.customers WHERE id = p_absorber;
  IF NOT FOUND THEN RAISE EXCEPTION 'cliente no encontrado' USING errcode = '23514'; END IF;
  IF v_c.is_system OR v_a.is_system THEN
    RAISE EXCEPTION 'Mostrador no se puede combinar' USING errcode = '23514';
  END IF;

  -- The sale keeps a copy of the name for the ticket and the list; it has to
  -- follow, or /ventas keeps showing a customer that no longer exists.
  UPDATE public.sales SET customer_id = p_conservar, customer_name = v_c.nombre
   WHERE customer_id = p_absorber;
  GET DIAGNOSTICS n_ventas = ROW_COUNT;

  UPDATE public.cotizaciones SET customer_id = p_conservar WHERE customer_id = p_absorber;
  GET DIAGNOSTICS n_cotiz = ROW_COUNT;

  UPDATE public.saldo_movimientos SET customer_id = p_conservar WHERE customer_id = p_absorber;
  GET DIAGNOSTICS n_saldo = ROW_COUNT;

  UPDATE public.garantias_cliente SET customer_id = p_conservar WHERE customer_id = p_absorber;
  GET DIAGNOSTICS n_gar = ROW_COUNT;

  -- Same phone on both cards (4772767340 and 524772767340 are one number):
  -- the absorbed copy goes, the survivor's stays.
  DELETE FROM public.customer_phones cp
   WHERE cp.customer_id = p_absorber
     AND right(regexp_replace(cp.telefono, '\D', '', 'g'), 10) IN (
       SELECT right(regexp_replace(telefono, '\D', '', 'g'), 10)
         FROM public.customer_phones WHERE customer_id = p_conservar
       UNION
       SELECT right(regexp_replace(v_c.telefono, '\D', '', 'g'), 10)
     );
  UPDATE public.customer_phones SET customer_id = p_conservar WHERE customer_id = p_absorber;
  GET DIAGNOSTICS n_tel = ROW_COUNT;

  -- The absorbed row's own number becomes an extra number on the survivor.
  INSERT INTO public.customer_phones (customer_id, telefono, etiqueta, created_by)
  SELECT p_conservar, v_a.telefono, NULLIF(v_a.nombre, v_c.nombre), v_c.created_by
   WHERE length(regexp_replace(v_a.telefono, '\D', '', 'g')) >= 10
     AND right(regexp_replace(v_a.telefono, '\D', '', 'g'), 10) NOT IN (
       SELECT right(regexp_replace(telefono, '\D', '', 'g'), 10)
         FROM public.customer_phones WHERE customer_id = p_conservar
       UNION
       SELECT right(regexp_replace(v_c.telefono, '\D', '', 'g'), 10)
     )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n_extra = ROW_COUNT;

  -- What the survivor keeps: its own data, completed with whatever only the
  -- absorbed row had. The discount is the better of the two — a merge must not
  -- quietly take a promise away from the customer.
  UPDATE public.customers SET
    email                = coalesce(v_c.email, v_a.email),
    notas                = NULLIF(btrim(coalesce(v_c.notas, '') ||
                             CASE WHEN coalesce(v_a.notas, '') <> '' THEN E'\n' || v_a.notas ELSE '' END), ''),
    descuento_pct        = greatest(v_c.descuento_pct, v_a.descuento_pct),
    credito_dias         = coalesce(v_c.credito_dias, v_a.credito_dias),
    credito_limite_cents = coalesce(v_c.credito_limite_cents, v_a.credito_limite_cents)
   WHERE id = p_conservar;

  UPDATE public.customers
     SET is_active = false, fusionado_en = p_conservar
   WHERE id = p_absorber;

  RETURN QUERY SELECT n_ventas, n_cotiz, n_saldo, n_gar, n_tel + n_extra;
END;
$$;
