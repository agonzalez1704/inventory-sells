-- Restrict returns to admins (DB-level, on top of the server action check).
CREATE OR REPLACE FUNCTION public.devolver_items(
  p_sale_id uuid,
  p_items   jsonb,
  p_metodo  text,
  p_motivo  text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid    text := public.requesting_user_id();
  v_status text;
  v_item   jsonb;
  v_pid    uuid;
  v_qty    int;
  v_sold   int;
  v_unit   int;
  v_prev   int;
  v_total  int := 0;
  v_devid  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'solo administradores pueden hacer devoluciones' USING errcode = '42501';
  END IF;
  IF p_metodo IS NULL OR p_metodo NOT IN ('efectivo','tarjeta','transferencia','otro') THEN
    RAISE EXCEPTION 'método inválido';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'no items';
  END IF;

  SELECT status INTO v_status FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'venta no encontrada';
  END IF;
  IF v_status <> 'completed' THEN
    RAISE EXCEPTION 'solo se devuelven ventas cerradas (status %)', v_status;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'qty')::int;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'cantidad inválida';
    END IF;

    SELECT qty, unit_price_cents INTO v_sold, v_unit
    FROM public.sale_items WHERE sale_id = p_sale_id AND product_id = v_pid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ese producto no está en la venta';
    END IF;

    SELECT COALESCE(SUM(di.qty), 0) INTO v_prev
    FROM public.devolucion_items di
    JOIN public.devoluciones d ON d.id = di.devolucion_id
    WHERE d.sale_id = p_sale_id AND di.product_id = v_pid;

    IF v_qty > v_sold - v_prev THEN
      RAISE EXCEPTION 'la devolución excede lo vendido (vendido %, ya devuelto %)', v_sold, v_prev;
    END IF;

    v_total := v_total + v_unit * v_qty;
  END LOOP;

  INSERT INTO public.devoluciones (sale_id, monto_cents, metodo, motivo, created_by)
  VALUES (p_sale_id, v_total, p_metodo, NULLIF(btrim(p_motivo), ''), v_uid)
  RETURNING id INTO v_devid;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'qty')::int;
    SELECT unit_price_cents INTO v_unit
    FROM public.sale_items WHERE sale_id = p_sale_id AND product_id = v_pid;

    INSERT INTO public.devolucion_items (devolucion_id, product_id, qty, unit_price_cents)
    VALUES (v_devid, v_pid, v_qty, v_unit);

    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
    VALUES (v_pid, v_qty, 'return', p_sale_id, v_uid);
  END LOOP;

  RETURN v_devid;
END;
$$;
