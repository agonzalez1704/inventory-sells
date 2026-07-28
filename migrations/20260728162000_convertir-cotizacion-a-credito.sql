-- Converting a quote produces a CREDIT sale (fiado), not a paid sale.
--
-- Business reality: every nota goes out on credit. The product ships (stock
-- decrements) with the delivery driver; the cash comes back later and the caja
-- manager reconciles it by the quote folio. So convert creates a `pending` sale
-- (payment_method NULL, not settled) whose note carries the folio — it then
-- lives in Fiados, where the manager finds it by folio and marks it collected.
-- The seller no longer chases the money.
--
-- Drops the old (uuid, text) signature — no payment method is chosen at convert.

DROP FUNCTION IF EXISTS public.convertir_cotizacion(uuid, text);

CREATE OR REPLACE FUNCTION public.convertir_cotizacion(p_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_c       public.cotizaciones%ROWTYPE;
  v_sale_id uuid;
  v_cust    text;
  v_item    record;
  v_prod    public.products%ROWTYPE;
BEGIN
  SELECT * INTO v_c FROM public.cotizaciones WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cotización no encontrada'; END IF;
  IF v_c.estado = 'convertida' THEN RETURN v_c.sale_id; END IF;   -- idempotent
  IF v_c.estado <> 'autorizada' THEN RAISE EXCEPTION 'la cotización no está autorizada'; END IF;

  IF v_c.customer_id IS NOT NULL THEN
    SELECT nombre INTO v_cust FROM public.customers WHERE id = v_c.customer_id;
  END IF;

  -- Credit sale: pending, no payment yet. Folio in the note for reconciliation.
  INSERT INTO public.sales (status, payment_method, customer_name, customer_id, sold_by, total_cents, canal, note)
  VALUES ('pending', NULL, v_cust, v_c.customer_id, COALESCE(v_c.vendedor_id, v_c.created_by),
          v_c.total_cents, 'mostrador', 'Cotización ' || v_c.folio)
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT product_id, nombre, sku, qty, unit_price_cents
                FROM public.cotizacion_items WHERE cotizacion_id = p_id
  LOOP
    IF v_item.product_id IS NOT NULL THEN
      SELECT * INTO v_prod FROM public.products WHERE id = v_item.product_id FOR UPDATE;
      IF FOUND THEN
        IF v_prod.quantity < v_item.qty THEN
          RAISE EXCEPTION 'Sin stock suficiente de %', v_prod.name USING errcode = '23514';
        END IF;
        INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
        VALUES (v_item.product_id, -v_item.qty, 'sale', v_sale_id, COALESCE(v_c.vendedor_id, v_c.created_by));
      END IF;
    END IF;

    INSERT INTO public.sale_items (sale_id, product_id, qty, unit_price_cents, line_total_cents)
    VALUES (v_sale_id, v_item.product_id, v_item.qty, v_item.unit_price_cents, v_item.unit_price_cents * v_item.qty);
  END LOOP;

  UPDATE public.cotizaciones
     SET estado = 'convertida', sale_id = v_sale_id, updated_at = now()
   WHERE id = p_id;

  RETURN v_sale_id;
END;
$$;
