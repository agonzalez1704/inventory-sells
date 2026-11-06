-- Si nadie capturó el total de la factura (0), al recibir se toma la suma de las líneas.
-- Misma firma y mismo cuerpo que 20260821120000; solo se agrega el UPDATE del total.
DROP FUNCTION IF EXISTS public.confirmar_compra(uuid);
CREATE FUNCTION public.confirmar_compra(p_id uuid)
RETURNS TABLE (piezas int, total bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_estado text;
  v_uid    text := coalesce(public.requesting_user_id(), 'sistema');
  v_piezas int;
  v_total  bigint;
BEGIN
  SELECT estado INTO v_estado FROM public.compras WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'compra no encontrada'; END IF;
  IF v_estado <> 'borrador' THEN
    RAISE EXCEPTION 'la compra ya fue % — solo un borrador se puede recibir', v_estado;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.compra_items WHERE compra_id = p_id) THEN
    RAISE EXCEPTION 'la compra no tiene productos';
  END IF;

  INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
  SELECT ci.product_id, ci.qty, 'purchase', p_id, v_uid
    FROM public.compra_items ci WHERE ci.compra_id = p_id;

  -- One cost layer per line: this is what makes FIFO possible downstream.
  INSERT INTO public.costo_capas
    (product_id, compra_id, qty_inicial, qty_restante, costo_unitario_cents)
  SELECT ci.product_id, p_id, ci.qty, ci.qty, ci.costo_unitario_cents
    FROM public.compra_items ci WHERE ci.compra_id = p_id;

  -- A costless product takes its first purchase's cost. Established costs are
  -- never overwritten here.
  UPDATE public.products p
     SET cost_cents = ci.costo_unitario_cents
    FROM public.compra_items ci
   WHERE ci.compra_id = p_id
     AND ci.product_id = p.id
     AND p.cost_cents = 0
     AND ci.costo_unitario_cents > 0;

  SELECT coalesce(sum(qty), 0), coalesce(sum(line_total_cents), 0)
    INTO v_piezas, v_total
    FROM public.compra_items WHERE compra_id = p_id;

  UPDATE public.compras
     SET estado = 'recibida',
         recibida_at = now(),
         total_factura_cents = CASE WHEN total_factura_cents = 0 THEN v_total ELSE total_factura_cents END
   WHERE id = p_id;
  RETURN QUERY SELECT v_piezas, v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_compra(uuid) TO authenticated;
