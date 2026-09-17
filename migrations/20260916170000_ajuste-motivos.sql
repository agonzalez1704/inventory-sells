-- /inventario redesign, part 3: stock adjustments with a fixed reason and undo.
--
-- The panel asks "¿cuántas contaste?" instead of "+/−": the user types what is
-- on the shelf, the function works out the delta. `p_esperado` is the stock the
-- user saw when they started counting; if a sale landed meanwhile the count
-- would overwrite it, so the function refuses and says the new number.
--
-- Undo writes the inverse movement (the ledger stays append-only) pointing at
-- the original through ref_id, which also stops a second undo.

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS motivo text;
DO $$ BEGIN
  ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_motivo_check
    CHECK (motivo IN ('conteo', 'danada', 'robo', 'devolucion', 'otro'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.ajustar_stock(
  p_product_id uuid,
  p_contado    integer,
  p_esperado   integer,
  p_motivo     text,
  p_nota       text DEFAULT NULL
)
RETURNS TABLE (movimiento_id uuid, cantidad integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_uid   text := public.requesting_user_id();
  v_qty   integer;
  v_delta integer;
  v_id    uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF NOT (public.is_admin() OR public.has_permiso('inventario_gestionar')) THEN
    RAISE EXCEPTION 'No tienes permiso para ajustar stock' USING errcode = '42501';
  END IF;
  IF p_motivo IS NULL OR p_motivo NOT IN ('conteo', 'danada', 'robo', 'devolucion', 'otro') THEN
    RAISE EXCEPTION 'Elige un motivo';
  END IF;
  IF p_motivo = 'otro' AND coalesce(btrim(p_nota), '') = '' THEN
    RAISE EXCEPTION 'Con motivo "Otro", escribe una nota';
  END IF;
  IF p_contado IS NULL OR p_contado < 0 THEN
    RAISE EXCEPTION 'La cantidad no puede ser negativa';
  END IF;

  SELECT quantity INTO v_qty FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;
  IF p_esperado IS NOT NULL AND v_qty <> p_esperado THEN
    RAISE EXCEPTION 'El stock cambió mientras contabas: ahora hay % piezas. Revisa y vuelve a guardar', v_qty;
  END IF;

  v_delta := p_contado - v_qty;
  IF v_delta = 0 THEN
    RAISE EXCEPTION 'La cantidad es la misma que en sistema';
  END IF;

  INSERT INTO public.inventory_movements (product_id, delta, reason, motivo, note, created_by)
  VALUES (p_product_id, v_delta,
          CASE WHEN p_motivo = 'devolucion' THEN 'return' ELSE 'adjustment' END,
          p_motivo, nullif(btrim(p_nota), ''), v_uid)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, p_contado;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.deshacer_ajuste(p_movimiento_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_uid text := public.requesting_user_id();
  v_m   public.inventory_movements%ROWTYPE;
  v_qty integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF NOT (public.is_admin() OR public.has_permiso('inventario_gestionar')) THEN
    RAISE EXCEPTION 'No tienes permiso para ajustar stock' USING errcode = '42501';
  END IF;

  SELECT * INTO v_m FROM public.inventory_movements WHERE id = p_movimiento_id;
  IF NOT FOUND OR v_m.motivo IS NULL OR v_m.reason NOT IN ('adjustment', 'return') THEN
    RAISE EXCEPTION 'Ese ajuste no se puede deshacer';
  END IF;
  IF v_m.created_by IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo quien hizo el ajuste puede deshacerlo';
  END IF;
  IF v_m.created_at < now() - interval '15 minutes' THEN
    RAISE EXCEPTION 'Pasaron más de 15 minutos: haz un ajuste nuevo';
  END IF;

  SELECT quantity INTO v_qty FROM public.products WHERE id = v_m.product_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.inventory_movements WHERE ref_id = v_m.id) THEN
    RAISE EXCEPTION 'Ese ajuste ya se deshizo';
  END IF;
  IF v_qty - v_m.delta < 0 THEN
    RAISE EXCEPTION 'No se puede deshacer: el stock quedaría negativo';
  END IF;

  INSERT INTO public.inventory_movements (product_id, delta, reason, motivo, ref_id, note, created_by)
  VALUES (v_m.product_id, -v_m.delta, v_m.reason, v_m.motivo, v_m.id, 'Ajuste deshecho', v_uid);

  RETURN v_qty - v_m.delta;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.ajustar_stock(uuid, integer, integer, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.deshacer_ajuste(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ajustar_stock(uuid, integer, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deshacer_ajuste(uuid) TO authenticated;
