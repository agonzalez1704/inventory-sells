-- Settle a warranty that was taken in pending.
--
-- registrar_garantia_cliente can leave one open — the part is received and the
-- decision comes later, which is how a counter actually works. But there was no
-- way out of that state: a pending warranty stayed pending forever, and the
-- credit it might owe could never be created.
--
-- Rejecting is a real outcome, not a delete. "We looked at it and it is not
-- covered" is something the shop needs to be able to show the customer later.
CREATE OR REPLACE FUNCTION public.resolver_garantia_cliente(
  p_id         uuid,
  -- NULL rejects it; otherwise it is accepted and settled this way.
  p_resolucion text DEFAULT NULL,
  p_motivo     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid   text := public.requesting_user_id();
  v_g     public.garantias_cliente%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF p_resolucion IS NOT NULL AND p_resolucion NOT IN ('saldo','cambio','efectivo') THEN
    RAISE EXCEPTION 'resolución inválida: %', p_resolucion;
  END IF;

  SELECT * INTO v_g FROM public.garantias_cliente WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'garantía no encontrada';
  END IF;

  -- The lock plus this check is what stops two people settling the same
  -- warranty at once and crediting it twice.
  IF v_g.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'esta garantía ya está %', v_g.estado;
  END IF;

  UPDATE public.garantias_cliente
  SET estado      = CASE WHEN p_resolucion IS NULL THEN 'rechazada' ELSE 'aceptada' END,
      resolucion  = p_resolucion,
      resuelta_at = now(),
      motivo      = coalesce(NULLIF(btrim(p_motivo), ''), motivo)
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

-- The list itself, with the names already joined: a screen that shows twenty
-- warranties should not make twenty trips for the customer and the part.
CREATE OR REPLACE FUNCTION public.listar_garantias_cliente(p_limite int DEFAULT 100)
RETURNS TABLE (
  id              uuid,
  sale_id         uuid,
  cliente         text,
  customer_id     uuid,
  pieza           text,
  sku             text,
  qty             int,
  monto_cents     int,
  motivo          text,
  reingresa_stock boolean,
  estado          text,
  resolucion      text,
  created_at      timestamptz,
  resuelta_at     timestamptz
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT g.id, g.sale_id, c.nombre, g.customer_id, p.name, p.sku, g.qty,
         g.monto_cents, g.motivo, g.reingresa_stock, g.estado, g.resolucion,
         g.created_at, g.resuelta_at
    FROM public.garantias_cliente g
    JOIN public.customers c ON c.id = g.customer_id
    JOIN public.products  p ON p.id = g.product_id
   -- Pending first: those are the ones somebody still has to act on.
   ORDER BY (g.estado = 'pendiente') DESC, g.created_at DESC
   LIMIT greatest(1, least(coalesce(p_limite, 100), 500));
$$;

GRANT EXECUTE ON FUNCTION public.listar_garantias_cliente(int) TO authenticated;
