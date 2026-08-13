-- Chain a customer's warranty to the claim the shop files upstream.
--
-- garantias_cliente.garantia_proveedor_id has existed since the table did, with
-- nothing to fill it: the two claims had to be captured separately and nothing
-- said they were about the same part.
--
-- Priced at COST, not at what the customer paid. Those are different numbers
-- and confusing them over-claims: the customer is owed what they handed over,
-- the supplier owes what the shop handed over. Best available cost is what that
-- supplier last charged for the part, falling back to the product's own.
CREATE OR REPLACE FUNCTION public.reclamar_garantia_a_proveedor(
  p_garantia_id  uuid,
  p_proveedor_id uuid,
  -- Override when the operator knows better than the last purchase price.
  p_monto_cents  int DEFAULT NULL,
  p_notas        text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid    text := public.requesting_user_id();
  v_g      public.garantias_cliente%ROWTYPE;
  v_nombre text;
  v_sku    text;
  v_costo  bigint;
  v_new    uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;

  SELECT * INTO v_g FROM public.garantias_cliente WHERE id = p_garantia_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'garantía no encontrada';
  END IF;
  IF v_g.garantia_proveedor_id IS NOT NULL THEN
    RAISE EXCEPTION 'esta garantía ya tiene un reclamo al proveedor';
  END IF;

  -- Claiming a part that went back on the shelf is asking the supplier to pay
  -- for something the shop still has and can sell. That is not a warranty, it
  -- is a purchase return, and it goes through a different door.
  IF v_g.reingresa_stock THEN
    RAISE EXCEPTION
      'esa pieza volvió a existencias: no hay nada que reclamarle al proveedor';
  END IF;

  SELECT p.name, p.sku, p.cost_cents INTO v_nombre, v_sku, v_costo
  FROM public.products p WHERE p.id = v_g.product_id;

  IF p_monto_cents IS NULL THEN
    -- What this supplier last charged for it, if they ever sold it to us.
    SELECT costo_ultimo_cents INTO v_costo
      FROM public.proveedores_de_producto(v_g.product_id)
     WHERE proveedor_id = p_proveedor_id;
    IF v_costo IS NULL THEN
      SELECT cost_cents INTO v_costo FROM public.products WHERE id = v_g.product_id;
    END IF;
    v_costo := coalesce(v_costo, 0) * v_g.qty;
  ELSE
    v_costo := greatest(0, p_monto_cents);
  END IF;

  INSERT INTO public.garantias_proveedor
    (proveedor_id, product_id, descripcion, qty, monto_cents, fecha, notas, created_by)
  VALUES
    (p_proveedor_id, v_g.product_id,
     coalesce(v_sku || ' · ', '') || coalesce(v_nombre, 'Pieza'),
     v_g.qty, v_costo, current_date,
     -- Carries the customer's reason across: the supplier's first question is
     -- what failed, and it was already written down once.
     coalesce(NULLIF(btrim(p_notas), ''), v_g.motivo),
     v_uid)
  RETURNING id INTO v_new;

  UPDATE public.garantias_cliente
  SET garantia_proveedor_id = v_new
  WHERE id = p_garantia_id;

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reclamar_garantia_a_proveedor(uuid, uuid, int, text)
  TO authenticated;
