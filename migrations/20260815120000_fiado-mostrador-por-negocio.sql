-- Whether a credit note needs a registered customer is the shop's rule, not the
-- code's.
--
-- The current guard came from a real problem in Fiable: six of seven loans had
-- no customer id, the note WAS the debtor ("Ernesto · Local 87"), so there was
-- no way to see everything one person owed and no phone to call. Requiring a
-- customer fixed that, and the four loans since all carry one.
--
-- But the two shops sell differently. In Fiable the counter cannot stop to
-- register somebody who is buying one screen on credit until Friday, and a rule
-- that blocks the sale gets worked around rather than followed. Ruli wants to
-- keep it. One database each, so this belongs in each shop's own config.
--
-- Defaults to true — today's behaviour everywhere. Fiable is flipped as data,
-- not in this file, because the value is a business decision that shop can
-- change from Configuración, not a schema fact that a migration should keep
-- reasserting on every run.
ALTER TABLE public.config_negocio
  ADD COLUMN IF NOT EXISTS fiado_exige_cliente boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.config_negocio.fiado_exige_cliente IS
  'true: una nota de crédito necesita un cliente registrado. false: se permite a Mostrador, y entonces la nota es obligatoria.';

-- ---------------------------------------------------------------------------
-- p_customer_id now defaults to NULL meaning "Mostrador", so a caller that has
-- nobody to name does not have to look the placeholder up first.
--
-- When Mostrador is allowed, the note carries the whole identity of the debt —
-- it is the only thing that will ever say who owes this. So it stops being an
-- optional reminder and becomes required, and required means something: a
-- couple of characters is not an identification.
CREATE OR REPLACE FUNCTION public.register_loan(
  p_items       jsonb,
  p_customer_id uuid DEFAULT NULL,
  p_note        text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid          text := public.requesting_user_id();
  v_sale_id      uuid;
  v_item         jsonb;
  v_product      public.products%ROWTYPE;
  v_qty          int;
  v_line_total   int;
  v_total        int := 0;
  v_cust         public.customers%ROWTYPE;
  v_exige        boolean;
  v_nota         text := NULLIF(btrim(p_note), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'no items';
  END IF;

  SELECT coalesce(fiado_exige_cliente, true) INTO v_exige
  FROM public.config_negocio WHERE id = 1;
  v_exige := coalesce(v_exige, true);

  IF p_customer_id IS NULL THEN
    IF v_exige THEN
      RAISE EXCEPTION 'un crédito necesita cliente: elige a quién se le fía'
        USING errcode = '23514';
    END IF;
    -- No customer named and the shop allows it: it is a walk-in debt.
    SELECT * INTO v_cust FROM public.customers WHERE is_system ORDER BY created_at LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'no existe el cliente Mostrador' USING errcode = '23514';
    END IF;
  ELSE
    SELECT * INTO v_cust FROM public.customers WHERE id = p_customer_id;
    IF NOT FOUND OR NOT v_cust.is_active THEN
      RAISE EXCEPTION 'cliente no encontrado o inactivo' USING errcode = '23514';
    END IF;
  END IF;

  IF v_cust.is_system THEN
    IF v_exige THEN
      RAISE EXCEPTION 'no se puede fiar a Mostrador: registra al cliente'
        USING errcode = '23514';
    END IF;
    -- The note is the debtor now. Nothing else on this row will ever say who
    -- owes the money, so an empty or throwaway one leaves a debt owed by
    -- nobody — which is the state the customer requirement existed to prevent.
    IF v_nota IS NULL OR length(v_nota) < 5 THEN
      RAISE EXCEPTION 'fiado a Mostrador: escribe en la nota quién debe (nombre, teléfono o seña)'
        USING errcode = '23514';
    END IF;
  END IF;

  INSERT INTO public.sales (status, payment_method, note, customer_id, customer_name, sold_by, total_cents)
  VALUES ('pending', NULL, v_nota, v_cust.id, v_cust.nombre, v_uid, 0)
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'qty')::int;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'invalid qty for item %', v_item;
    END IF;

    SELECT * INTO v_product FROM public.products
    WHERE id = (v_item->>'product_id')::uuid FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'product % not found', v_item->>'product_id';
    END IF;
    IF v_product.quantity < v_qty THEN
      RAISE EXCEPTION 'insufficient stock for % (have %, need %)',
        v_product.sku, v_product.quantity, v_qty USING errcode = '23514';
    END IF;

    v_line_total := v_product.price_cents * v_qty;
    v_total := v_total + v_line_total;

    INSERT INTO public.sale_items (sale_id, product_id, qty, unit_price_cents, line_total_cents)
    VALUES (v_sale_id, v_product.id, v_qty, v_product.price_cents, v_line_total);

    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
    VALUES (v_product.id, -v_qty, 'sale', v_sale_id, v_uid);
  END LOOP;

  UPDATE public.sales SET total_cents = v_total WHERE id = v_sale_id;
  RETURN v_sale_id;
END;
$$;

-- No DROP here: adding a DEFAULT to p_customer_id does not change the identity
-- arguments (jsonb, uuid, text), so CREATE OR REPLACE updates the existing
-- function rather than creating a second one to be ambiguous with.
GRANT EXECUTE ON FUNCTION public.register_loan(jsonb, uuid, text) TO authenticated;
