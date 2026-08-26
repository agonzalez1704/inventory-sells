-- Two gaps in settling a customer warranty with cash:
--
-- 1. "Efectivo" only marked the row. The money physically left the drawer but
--    nothing recorded it, so the day's corte never balanced — the modal even
--    told the operator to capture a separate devolución by hand. The refund now
--    writes itself into gastos (metodo efectivo, categoría Garantía) at the
--    moment of resolution, which is when the cash actually leaves.
--
-- 2. Re-entry was decided once, at registration. A part taken in as "fuera de
--    existencias" could never come back to the shelf later — but after paying
--    the customer the shop OWNS the part and may want to retest and resell it.
--    Resolution can now re-enter it (p_reingresa), and reingresa_stock flips to
--    true so the POS can show the unit as linked to this warranty.
--
-- The parameter list changes (new p_reingresa), so the 3-arg version must go
-- first — CREATE OR REPLACE would leave both and make every call ambiguous.
DROP FUNCTION IF EXISTS public.resolver_garantia_cliente(uuid, text, text);

CREATE FUNCTION public.resolver_garantia_cliente(
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

  -- The cash leaves the drawer now, so the corte records it now. Same
  -- transaction as the resolution: one cannot exist without the other.
  IF p_resolucion = 'efectivo' AND v_g.monto_cents > 0 THEN
    SELECT name INTO v_pieza FROM public.products WHERE id = v_g.product_id;
    SELECT nombre INTO v_nombre FROM public.customers WHERE id = v_g.customer_id;
    INSERT INTO public.gastos (concepto, monto_cents, metodo, categoria, created_by)
    VALUES (
      'Garantía: ' || coalesce(v_pieza, 'pieza') || ' — ' || coalesce(v_nombre, 'cliente'),
      v_g.monto_cents, 'efectivo', 'Garantía', v_uid
    );
  END IF;

  -- Re-enter the part if it wasn't already back. Only on an accepted claim —
  -- a rejected one means the customer keeps their part.
  IF p_reingresa AND p_resolucion IS NOT NULL AND NOT v_g.reingresa_stock THEN
    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
    VALUES (v_g.product_id, v_g.qty, 'return', v_g.sale_id, v_uid);
    UPDATE public.products SET quantity = quantity + v_g.qty WHERE id = v_g.product_id;
    UPDATE public.garantias_cliente SET reingresa_stock = true WHERE id = p_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolver_garantia_cliente(uuid, text, text, boolean) TO authenticated;
