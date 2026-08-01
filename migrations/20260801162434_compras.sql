-- Compras a proveedor, parte 1: capture the invoice and receive the stock.
-- (Credit notes, payments and the payable balance are part 2.)
--
-- The invoice is typed in COMPLETE — exactly as the paper reads — so the
-- captured lines can be reconciled against its stated total before anything
-- touches inventory. A purchase therefore has two moments: `borrador` while
-- it's being typed and checked, and `recibida` once confirmed, which is when
-- the stock ledger moves.

CREATE TABLE public.compras (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id        uuid NOT NULL REFERENCES public.proveedores(id),
  folio_factura       text,                    -- el número impreso en el papel
  fecha_ingreso       date NOT NULL DEFAULT current_date,
  condicion           text NOT NULL DEFAULT 'contado'
                        CHECK (condicion IN ('contado', 'credito')),
  dias_credito        smallint NOT NULL DEFAULT 0
                        CHECK (dias_credito >= 0 AND dias_credito <= 365),
  -- Derived, never typed twice: when the credit runs out.
  vence_el            date GENERATED ALWAYS AS (fecha_ingreso + dias_credito) STORED,
  -- Prompt payment is only FLAGGED, never computed — the business asked for a
  -- marker ("este sí tiene pronto pago y te da este descuento"), not a calculator.
  pronto_pago         boolean NOT NULL DEFAULT false,
  pronto_pago_pct     numeric(5,2) CHECK (pronto_pago_pct IS NULL OR (pronto_pago_pct > 0 AND pronto_pago_pct <= 100)),
  pronto_pago_dias    smallint CHECK (pronto_pago_dias IS NULL OR pronto_pago_dias > 0),
  -- What the paper says it totals. Compared against the sum of the lines.
  total_factura_cents bigint NOT NULL DEFAULT 0 CHECK (total_factura_cents >= 0),
  estado              text NOT NULL DEFAULT 'borrador'
                        CHECK (estado IN ('borrador', 'recibida', 'cancelada')),
  notas               text,
  created_by          text NOT NULL DEFAULT public.requesting_user_id(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  recibida_at         timestamptz
);

CREATE INDEX compras_proveedor_idx ON public.compras (proveedor_id, fecha_ingreso DESC);
CREATE INDEX compras_estado_idx    ON public.compras (estado);
-- One invoice number per supplier; re-typing the same folio is a slip.
CREATE UNIQUE INDEX compras_folio_uidx
  ON public.compras (proveedor_id, lower(btrim(folio_factura)))
  WHERE folio_factura IS NOT NULL AND btrim(folio_factura) <> '';

CREATE TRIGGER compras_touch_updated_at
  BEFORE UPDATE ON public.compras
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Each line carries the cost PAID IN THIS PURCHASE, not the catalog cost. That
-- is what makes a line a cost layer (R10) once we start costing sales properly.
CREATE TABLE public.compra_items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id            uuid NOT NULL REFERENCES public.compras(id) ON DELETE CASCADE,
  product_id           uuid NOT NULL REFERENCES public.products(id),
  qty                  int NOT NULL CHECK (qty > 0),
  costo_unitario_cents bigint NOT NULL DEFAULT 0 CHECK (costo_unitario_cents >= 0),
  line_total_cents     bigint GENERATED ALWAYS AS (qty * costo_unitario_cents) STORED,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX compra_items_compra_idx  ON public.compra_items (compra_id);
CREATE INDEX compra_items_product_idx ON public.compra_items (product_id);
-- Same product twice in one invoice = edit the quantity, not a second line.
CREATE UNIQUE INDEX compra_items_uidx ON public.compra_items (compra_id, product_id);

-- ---- Receiving: the only path that moves stock ----
-- Writes one `purchase` movement per line; the ledger trigger keeps
-- products.quantity in step. Draft → recibida, once.
CREATE OR REPLACE FUNCTION public.confirmar_compra(p_id uuid)
RETURNS TABLE (piezas int, total_cents bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_estado text;
  v_uid    text := public.requesting_user_id();
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

  UPDATE public.compras
     SET estado = 'recibida', recibida_at = now()
   WHERE id = p_id;

  RETURN QUERY SELECT v_piezas, v_total;
END;
$$;

-- Undo a receipt. The CHECK (quantity >= 0) on products is the backstop: if the
-- goods were already sold, the reversal fails instead of inventing negative
-- stock — which is the honest outcome.
CREATE OR REPLACE FUNCTION public.cancelar_compra(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_estado text;
  v_uid    text := public.requesting_user_id();
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

ALTER TABLE public.compras      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compra_items ENABLE ROW LEVEL SECURITY;

-- Purchases expose cost, so reading them is for inventory managers, not every
-- seller. Server Actions gate on `inventario_gestionar` and use the admin
-- client; these policies are the direct-access backstop.
CREATE POLICY "admin read compras" ON public.compras
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admin write compras" ON public.compras
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin read compra_items" ON public.compra_items
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admin write compra_items" ON public.compra_items
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compras      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compra_items TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_compra(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_compra(uuid)  TO authenticated;
