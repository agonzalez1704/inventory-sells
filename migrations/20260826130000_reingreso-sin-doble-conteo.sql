-- The movements_apply trigger already adds every inventory_movements delta to
-- products.quantity. Both warranty RPCs ALSO updated quantity by hand after
-- inserting their 'return' movement, so every re-entered warranty part counted
-- twice: registrar_garantia_cliente had done this since 2026-08-10, and
-- resolver_garantia_cliente copied the same bug yesterday. register_loan is the
-- model to follow — insert the movement, let the trigger do the arithmetic.
--
-- This redefines both without the manual UPDATE. The inflated quantities the
-- old code left behind are data, repaired separately (2 units in Fiable).

CREATE OR REPLACE FUNCTION public.registrar_garantia_cliente(
  p_sale_id uuid, p_product_id uuid, p_qty integer, p_motivo text,
  p_reingresa boolean, p_propuesta text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid    text := public.requesting_user_id();
  v_status text;
  v_cust   uuid;
  v_sys    boolean;
  v_sold   int;
  v_unit   int;
  v_prev   int;
  v_monto  int;
  v_gid    uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF NOT public.tiene_permiso('pos_vender') THEN
    RAISE EXCEPTION 'sin permiso para registrar garantías' USING errcode = '42501';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'cantidad inválida';
  END IF;
  IF p_propuesta IS NOT NULL AND p_propuesta NOT IN ('saldo','cambio','devolucion') THEN
    RAISE EXCEPTION 'propuesta inválida: %', p_propuesta;
  END IF;

  SELECT status, customer_id INTO v_status, v_cust
  FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'venta no encontrada';
  END IF;
  IF v_status <> 'completed' THEN
    RAISE EXCEPTION 'solo hay garantía sobre ventas cerradas (status %)', v_status;
  END IF;
  IF v_cust IS NULL THEN
    RAISE EXCEPTION 'la venta no tiene cliente: una garantía se resuelve con una persona';
  END IF;
  SELECT is_system INTO v_sys FROM public.customers WHERE id = v_cust;
  IF coalesce(v_sys, false) THEN
    RAISE EXCEPTION 'Mostrador no puede reclamar garantía: reasigna la venta al cliente';
  END IF;

  SELECT qty, unit_price_cents INTO v_sold, v_unit
  FROM public.sale_items WHERE sale_id = p_sale_id AND product_id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ese producto no está en la venta';
  END IF;

  SELECT coalesce(sum(qty), 0) INTO v_prev
  FROM public.garantias_cliente
  WHERE sale_id = p_sale_id AND product_id = p_product_id AND estado <> 'rechazada';

  IF p_qty > v_sold - v_prev THEN
    RAISE EXCEPTION 'la garantía excede lo vendido (vendido %, ya en garantía %)', v_sold, v_prev;
  END IF;

  v_monto := v_unit * p_qty;

  INSERT INTO public.garantias_cliente
    (sale_id, customer_id, product_id, qty, monto_cents, motivo,
     reingresa_stock, estado, resolucion_propuesta, created_by)
  VALUES
    (p_sale_id, v_cust, p_product_id, p_qty, v_monto, NULLIF(btrim(p_motivo), ''),
     coalesce(p_reingresa, false), 'pendiente', p_propuesta, v_uid)
  RETURNING id INTO v_gid;

  -- Stock moves on receipt, not on approval. The movements_apply trigger adds
  -- the delta to products.quantity — no manual UPDATE here or it counts twice.
  IF coalesce(p_reingresa, false) THEN
    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
    VALUES (p_product_id, p_qty, 'return', p_sale_id, v_uid);
  END IF;

  RETURN v_gid;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolver_garantia_cliente(
  p_id uuid,
  p_resolucion text DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_reingresa boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid    text := public.requesting_user_id();
  v_g      public.garantias_cliente%ROWTYPE;
  v_pieza  text;
  v_nombre text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF NOT public.tiene_permiso('garantias_aprobar') THEN
    RAISE EXCEPTION 'no tienes permiso para aprobar garantías' USING errcode = '42501';
  END IF;
  IF p_resolucion IS NOT NULL AND p_resolucion NOT IN ('saldo','cambio','efectivo') THEN
    RAISE EXCEPTION 'resolución inválida: %', p_resolucion;
  END IF;

  SELECT * INTO v_g FROM public.garantias_cliente WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'garantía no encontrada';
  END IF;
  IF v_g.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'esta garantía ya está %', v_g.estado;
  END IF;

  UPDATE public.garantias_cliente
  SET estado       = CASE WHEN p_resolucion IS NULL THEN 'rechazada' ELSE 'aceptada' END,
      resolucion   = p_resolucion,
      resuelta_at  = now(),
      aprobada_por = v_uid,
      motivo       = coalesce(NULLIF(btrim(p_motivo), ''), motivo)
  WHERE id = p_id;

  IF p_resolucion = 'saldo' THEN
    INSERT INTO public.saldo_movimientos
      (customer_id, monto_cents, origen, garantia_id, motivo, created_by)
    VALUES (v_g.customer_id, v_g.monto_cents, 'garantia', v_g.id,
            coalesce(NULLIF(btrim(p_motivo), ''), v_g.motivo, 'Garantía'), v_uid);
  END IF;

  IF p_resolucion = 'efectivo' AND v_g.monto_cents > 0 THEN
    SELECT name INTO v_pieza FROM public.products WHERE id = v_g.product_id;
    SELECT nombre INTO v_nombre FROM public.customers WHERE id = v_g.customer_id;
    INSERT INTO public.gastos (concepto, monto_cents, metodo, categoria, created_by)
    VALUES (
      'Garantía: ' || coalesce(v_pieza, 'pieza') || ' — ' || coalesce(v_nombre, 'cliente'),
      v_g.monto_cents, 'efectivo', 'Garantía', v_uid
    );
  END IF;

  -- The trigger applies the delta; inserting the movement IS the re-entry.
  IF p_reingresa AND p_resolucion IS NOT NULL AND NOT v_g.reingresa_stock THEN
    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
    VALUES (v_g.product_id, v_g.qty, 'return', v_g.sale_id, v_uid);
    UPDATE public.garantias_cliente SET reingresa_stock = true WHERE id = p_id;
  END IF;
END;
$$;
