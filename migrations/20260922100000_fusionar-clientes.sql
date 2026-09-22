-- Combine two records of the same person.
--
-- The same customer gets registered twice all the time — "jairo" with a
-- 10-digit phone and "joven jairo" with the same number carrying the 52
-- prefix — and then neither card tells the truth: purchases, debt and store
-- credit are split across two rows.
--
-- Merging MOVES the history instead of deleting anything: sales, quotes,
-- credit movements and warranties are repointed, the phones are kept as extra
-- numbers on the survivor, and the absorbed row stays archived with a pointer
-- to who it became — so a receipt someone printed last year still resolves.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS fusionado_en uuid REFERENCES public.customers(id);

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
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'solo un administrador puede combinar clientes' USING errcode = '42501';
  END IF;
  IF p_conservar IS NULL OR p_absorber IS NULL OR p_conservar = p_absorber THEN
    RAISE EXCEPTION 'elige dos clientes distintos' USING errcode = '23514';
  END IF;

  -- Locked in a fixed order: two tills merging the same pair must not deadlock.
  SELECT * INTO v_c FROM public.customers WHERE id = least(p_conservar, p_absorber) FOR UPDATE;
  SELECT * INTO v_a FROM public.customers WHERE id = greatest(p_conservar, p_absorber) FOR UPDATE;
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

  -- Phones: the absorbed row's own number becomes an extra number on the
  -- survivor, and so do its extras — minus the ones already there. Compared by
  -- the last 10 digits, because 4772767340 and 524772767340 are one phone.
  INSERT INTO public.customer_phones (customer_id, telefono, etiqueta, created_by)
  SELECT p_conservar, t.telefono, t.etiqueta, v_c.created_by
    FROM (
      SELECT telefono, etiqueta FROM public.customer_phones WHERE customer_id = p_absorber
      UNION
      SELECT v_a.telefono, NULLIF(v_a.nombre, v_c.nombre)
    ) t
   WHERE length(regexp_replace(t.telefono, '\D', '', 'g')) >= 10
     AND right(regexp_replace(t.telefono, '\D', '', 'g'), 10) NOT IN (
       SELECT right(regexp_replace(telefono, '\D', '', 'g'), 10)
         FROM public.customer_phones WHERE customer_id = p_conservar
       UNION
       SELECT right(regexp_replace(v_c.telefono, '\D', '', 'g'), 10)
     );
  GET DIAGNOSTICS n_tel = ROW_COUNT;
  DELETE FROM public.customer_phones WHERE customer_id = p_absorber;

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

  RETURN QUERY SELECT n_ventas, n_cotiz, n_saldo, n_gar, n_tel;
END;
$$;

REVOKE ALL ON FUNCTION public.fusionar_clientes(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.fusionar_clientes(uuid, uuid) TO authenticated;
