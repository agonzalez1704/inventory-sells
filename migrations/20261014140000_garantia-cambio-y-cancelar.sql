-- Two gaps on client warranties:
--   1. "Cambio físico" said the customer left with another part but never
--      touched stock: the replacement had to be deducted by hand (or wasn't).
--      Now the resolution names the part and the movement is written here.
--   2. A warranty registered on the wrong sale had no way out: the re-entry
--      had already added a unit. cancelar_garantia_cliente undoes that and
--      removes the row — only while it is still pending and unclaimed.

ALTER TABLE public.garantias_cliente
  ADD COLUMN IF NOT EXISTS cambio_product_id uuid REFERENCES public.products(id);

-- Signature change: DROP first.
DROP FUNCTION IF EXISTS public.resolver_garantia_cliente(uuid, text, text, boolean);

CREATE FUNCTION public.resolver_garantia_cliente(
  p_id uuid,
  p_resolucion text DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_reingresa boolean DEFAULT false,
  p_cambio_product_id uuid DEFAULT NULL
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
  v_stock  int;
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

  SELECT nombre INTO v_nombre FROM public.customers WHERE id = v_g.customer_id;

  -- The replacement leaves the shelf now, so it must exist and be there.
  IF p_resolucion = 'cambio' THEN
    IF p_cambio_product_id IS NULL THEN
      RAISE EXCEPTION 'di qué pieza se lleva el cliente';
    END IF;
    SELECT quantity, name INTO v_stock, v_pieza
    FROM public.products WHERE id = p_cambio_product_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'esa pieza no existe';
    END IF;
    IF v_stock < v_g.qty THEN
      RAISE EXCEPTION 'de % solo hay % en existencia', v_pieza, v_stock;
    END IF;
    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, note, created_by)
    VALUES (p_cambio_product_id, -v_g.qty, 'sale', v_g.sale_id,
            'Cambio por garantía · ' || coalesce(v_nombre, 'cliente'), v_uid);
  END IF;

  UPDATE public.garantias_cliente
  SET estado       = CASE WHEN p_resolucion IS NULL THEN 'rechazada' ELSE 'aceptada' END,
      resolucion   = p_resolucion,
      resuelta_at  = now(),
      aprobada_por = v_uid,
      motivo       = coalesce(NULLIF(btrim(p_motivo), ''), motivo),
      cambio_product_id = CASE WHEN p_resolucion = 'cambio' THEN p_cambio_product_id END
  WHERE id = p_id;

  IF p_resolucion = 'saldo' THEN
    INSERT INTO public.saldo_movimientos
      (customer_id, monto_cents, origen, garantia_id, motivo, created_by)
    VALUES (v_g.customer_id, v_g.monto_cents, 'garantia', v_g.id,
            coalesce(NULLIF(btrim(p_motivo), ''), v_g.motivo, 'Garantía'), v_uid);
  END IF;

  IF p_resolucion = 'efectivo' AND v_g.monto_cents > 0 THEN
    SELECT name INTO v_pieza FROM public.products WHERE id = v_g.product_id;
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

GRANT EXECUTE ON FUNCTION public.resolver_garantia_cliente(uuid, text, text, boolean, uuid) TO authenticated;

-- Undo a warranty taken in by mistake. Only pending ones: a resolved one has
-- already moved money (saldo, gasto) or stock out, and that is a reversal of
-- a different kind. A claimed one has a supplier row hanging off it.
CREATE OR REPLACE FUNCTION public.cancelar_garantia_cliente(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid    text := public.requesting_user_id();
  v_g      public.garantias_cliente%ROWTYPE;
  v_nombre text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF NOT public.tiene_permiso('garantias_aprobar') THEN
    RAISE EXCEPTION 'no tienes permiso para cancelar garantías' USING errcode = '42501';
  END IF;

  SELECT * INTO v_g FROM public.garantias_cliente WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'garantía no encontrada';
  END IF;
  IF v_g.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'ya está %: no se puede cancelar', v_g.estado;
  END IF;
  IF v_g.garantia_proveedor_id IS NOT NULL THEN
    RAISE EXCEPTION 'ya se reclamó al proveedor: borra ese reclamo primero';
  END IF;

  -- Take back the unit the registration put on the shelf.
  IF v_g.reingresa_stock THEN
    SELECT nombre INTO v_nombre FROM public.customers WHERE id = v_g.customer_id;
    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, note, created_by)
    VALUES (v_g.product_id, -v_g.qty, 'return', v_g.sale_id,
            'Garantía cancelada · ' || coalesce(v_nombre, 'cliente'), v_uid);
  END IF;

  DELETE FROM public.garantias_cliente WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancelar_garantia_cliente(uuid) TO authenticated;

-- The list shows which part went out on a cambio.
DROP FUNCTION IF EXISTS public.listar_garantias_cliente(int);

CREATE FUNCTION public.listar_garantias_cliente(p_limite int DEFAULT 100)
RETURNS TABLE (
  id              uuid,
  sale_id         uuid,
  cliente         text,
  customer_id     uuid,
  product_id      uuid,
  pieza           text,
  sku             text,
  qty             int,
  monto_cents     int,
  motivo          text,
  reingresa_stock boolean,
  estado          text,
  resolucion      text,
  resolucion_propuesta text,
  reportada_por   text,
  created_at      timestamptz,
  resuelta_at     timestamptz,
  garantia_proveedor_id uuid,
  proveedor       text,
  cambio_pieza    text
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT g.id, g.sale_id, c.nombre, g.customer_id, g.product_id, p.name, p.sku, g.qty,
         g.monto_cents, g.motivo, g.reingresa_stock, g.estado, g.resolucion,
         g.resolucion_propuesta, quien.full_name,
         g.created_at, g.resuelta_at, g.garantia_proveedor_id, pr.nombre, cp.name
    FROM public.garantias_cliente g
    JOIN public.customers c ON c.id = g.customer_id
    JOIN public.products  p ON p.id = g.product_id
    LEFT JOIN public.products cp ON cp.id = g.cambio_product_id
    LEFT JOIN public.profiles quien ON quien.id = g.created_by
    LEFT JOIN public.garantias_proveedor gp ON gp.id = g.garantia_proveedor_id
    LEFT JOIN public.proveedores pr ON pr.id = gp.proveedor_id
   ORDER BY (g.estado = 'pendiente') DESC, g.created_at DESC
   LIMIT greatest(1, least(coalesce(p_limite, 100), 500));
$$;

GRANT EXECUTE ON FUNCTION public.listar_garantias_cliente(int) TO authenticated;
