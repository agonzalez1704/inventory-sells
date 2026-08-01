-- These RPCs read requesting_user_id() to stamp who did it, then pass that
-- value explicitly — which OVERRIDES the column default, so a caller without a
-- user JWT (admin client, a job, a console) writes NULL into a NOT NULL column
-- and the whole operation fails. Fall back to 'sistema' instead: the audit
-- trail stays honest ("we don't know who") rather than blocking the work.
CREATE OR REPLACE FUNCTION public.crear_nota_credito(
  p_compra_id uuid,
  p_tipo      text,
  p_motivo    text,
  p_items     jsonb DEFAULT NULL,
  p_monto_cents bigint DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_estado text;
  v_uid    text := coalesce(public.requesting_user_id(), 'sistema');
  v_nota   uuid;
  v_item   jsonb;
  v_monto  bigint := 0;
  v_qty    int;
  v_costo  bigint;
BEGIN
  SELECT estado INTO v_estado FROM public.compras WHERE id = p_compra_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'compra no encontrada'; END IF;
  IF v_estado <> 'recibida' THEN
    RAISE EXCEPTION 'solo una compra recibida admite notas de crédito (está %)', v_estado;
  END IF;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' AND jsonb_array_length(p_items) > 0 THEN
    SELECT sum((i->>'qty')::int * (i->>'costo_unitario_cents')::bigint)
      INTO v_monto FROM jsonb_array_elements(p_items) i;
  ELSE
    v_monto := coalesce(p_monto_cents, 0);
  END IF;
  IF v_monto <= 0 THEN RAISE EXCEPTION 'la nota de crédito debe tener importe'; END IF;

  INSERT INTO public.compra_notas_credito (compra_id, tipo, monto_cents, motivo, created_by)
  VALUES (p_compra_id, p_tipo, v_monto, nullif(btrim(coalesce(p_motivo, '')), ''), v_uid)
  RETURNING id INTO v_nota;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      v_qty   := (v_item->>'qty')::int;
      v_costo := (v_item->>'costo_unitario_cents')::bigint;

      INSERT INTO public.compra_nota_items (nota_id, product_id, qty, costo_unitario_cents)
      VALUES (v_nota, (v_item->>'product_id')::uuid, v_qty, v_costo);

      INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
      VALUES ((v_item->>'product_id')::uuid, -v_qty, 'purchase_return', p_compra_id, v_uid);
    END LOOP;
  END IF;

  RETURN v_nota;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirmar_compra(p_id uuid)
RETURNS TABLE (piezas int, total_cents bigint)
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

  SELECT coalesce(sum(qty), 0), coalesce(sum(line_total_cents), 0)
    INTO v_piezas, v_total
    FROM public.compra_items WHERE compra_id = p_id;

  UPDATE public.compras SET estado = 'recibida', recibida_at = now() WHERE id = p_id;
  RETURN QUERY SELECT v_piezas, v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancelar_compra(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_estado text;
  v_uid    text := coalesce(public.requesting_user_id(), 'sistema');
BEGIN
  SELECT estado INTO v_estado FROM public.compras WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'compra no encontrada'; END IF;
  IF v_estado = 'cancelada' THEN RAISE EXCEPTION 'la compra ya está cancelada'; END IF;

  IF v_estado = 'recibida' THEN
    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
    SELECT ci.product_id, -ci.qty, 'purchase_cancel', p_id, v_uid
      FROM public.compra_items ci WHERE ci.compra_id = p_id;
  END IF;

  UPDATE public.compras SET estado = 'cancelada' WHERE id = p_id;
END;
$$;
