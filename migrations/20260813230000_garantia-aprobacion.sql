-- A warranty is reported by whoever is at the counter and approved by somebody
-- else.
--
-- registrar_garantia_cliente checked nothing beyond "is there a session", and
-- it could settle a claim as 'saldo' in the same call. Which means any seller
-- could mint store credit for anyone, including themselves through a friendly
-- customer. The ledger's constraint guaranteed every peso names a warranty; it
-- never said who may write that warranty.
--
-- So the two halves split: the seller records what happened and what the
-- customer is asking for. Someone with the permission decides.

-- A general version of is_admin(), which is the same query with the permiso
-- hard-coded. Every future check can use this instead of another copy.
CREATE OR REPLACE FUNCTION public.tiene_permiso(p_permiso text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles pr
    JOIN public.role_permissions rp ON rp.role_id = pr.role_id
    WHERE pr.id = public.requesting_user_id()
      AND rp.permiso IN (p_permiso, 'admin_total')
  );
$$;

GRANT EXECUTE ON FUNCTION public.tiene_permiso(text) TO authenticated;

-- What the seller says the customer wants. Distinct from `resolucion`, which is
-- what was actually granted — the whole point of an approval step is that those
-- two can differ.
ALTER TABLE public.garantias_cliente
  ADD COLUMN resolucion_propuesta text
    CHECK (resolucion_propuesta IN ('saldo', 'cambio', 'devolucion')),
  ADD COLUMN aprobada_por text;

-- ---- Who may approve ----
INSERT INTO public.role_permissions (role_id, permiso)
SELECT r.id, 'garantias_aprobar'
  FROM public.roles r
 WHERE r.slug IN ('dueno', 'jefe_almacen')
ON CONFLICT DO NOTHING;

-- ---- Recording one no longer settles it ----
DROP FUNCTION IF EXISTS public.registrar_garantia_cliente(uuid, uuid, int, text, boolean, text);

CREATE FUNCTION public.registrar_garantia_cliente(
  p_sale_id    uuid,
  p_product_id uuid,
  p_qty        int,
  p_motivo     text,
  p_reingresa  boolean,
  -- What the customer is asking for. A proposal, not a decision.
  p_propuesta  text DEFAULT NULL
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
  -- Anyone who can ring up a sale can report a warranty: they are the one the
  -- customer is standing in front of.
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

  -- Always pending. There is no path here that grants anything.
  INSERT INTO public.garantias_cliente
    (sale_id, customer_id, product_id, qty, monto_cents, motivo,
     reingresa_stock, estado, resolucion_propuesta, created_by)
  VALUES
    (p_sale_id, v_cust, p_product_id, p_qty, v_monto, NULLIF(btrim(p_motivo), ''),
     coalesce(p_reingresa, false), 'pendiente', p_propuesta, v_uid)
  RETURNING id INTO v_gid;

  -- Stock moves on receipt, not on approval: the part is physically back on the
  -- counter either way, and leaving it out of inventory until someone approves
  -- would have the shelf lie for as long as that takes.
  IF coalesce(p_reingresa, false) THEN
    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
    VALUES (p_product_id, p_qty, 'return', p_sale_id, v_uid);
    UPDATE public.products SET quantity = quantity + p_qty WHERE id = p_product_id;
  END IF;

  RETURN v_gid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_garantia_cliente(uuid, uuid, int, text, boolean, text)
  TO authenticated;

-- ---- Approving is its own permission ----
CREATE OR REPLACE FUNCTION public.resolver_garantia_cliente(
  p_id         uuid,
  p_resolucion text DEFAULT NULL,
  p_motivo     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid text := public.requesting_user_id();
  v_g   public.garantias_cliente%ROWTYPE;
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
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolver_garantia_cliente(uuid, text, text) TO authenticated;
