-- Compras parte 2: credit notes, payments, and what we actually owe.
--
-- The business states the arithmetic plainly: "el documento vale a tanto, tiene
-- una devolución de tanto o nota de crédito porque no llegó de tanto, y a total
-- a pagar tanto." So: saldo = factura − notas de crédito − pagos.
--
-- Credit notes come AFTER receiving, by design. The invoice is captured whole
-- and received whole; only then does "esto no llegó" get taken off — which is
-- why a note that names products also RETURNS that stock, keeping inventory
-- equal to what physically came in.

-- Returning goods to a supplier is its own motive: the cárdex has to be able to
-- say a unit went back on a credit note, not that someone adjusted the count.
ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_reason_check;
ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_reason_check
  CHECK (reason = ANY (ARRAY[
    'import', 'sale', 'adjustment', 'return', 'reserva',
    'purchase', 'purchase_cancel', 'purchase_return'
  ]));

CREATE TABLE public.compra_notas_credito (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id   uuid NOT NULL REFERENCES public.compras(id) ON DELETE CASCADE,
  -- no_llego  : facturado pero nunca llegó (baja stock)
  -- devolucion: llegó y se regresó (baja stock)
  -- descuento : ajuste comercial, sin mercancía de por medio
  tipo        text NOT NULL CHECK (tipo IN ('no_llego', 'devolucion', 'descuento')),
  monto_cents bigint NOT NULL CHECK (monto_cents > 0),
  motivo      text,
  fecha       date NOT NULL DEFAULT current_date,
  created_by  text NOT NULL DEFAULT public.requesting_user_id(),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX compra_notas_compra_idx ON public.compra_notas_credito (compra_id);

-- Only for notes that move goods; a `descuento` has none.
CREATE TABLE public.compra_nota_items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_id              uuid NOT NULL REFERENCES public.compra_notas_credito(id) ON DELETE CASCADE,
  product_id           uuid NOT NULL REFERENCES public.products(id),
  qty                  int NOT NULL CHECK (qty > 0),
  costo_unitario_cents bigint NOT NULL DEFAULT 0 CHECK (costo_unitario_cents >= 0),
  line_total_cents     bigint GENERATED ALWAYS AS (qty * costo_unitario_cents) STORED
);
CREATE INDEX compra_nota_items_nota_idx ON public.compra_nota_items (nota_id);

CREATE TABLE public.compra_pagos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id   uuid NOT NULL REFERENCES public.compras(id) ON DELETE CASCADE,
  monto_cents bigint NOT NULL CHECK (monto_cents > 0),
  metodo      text NOT NULL CHECK (metodo IN ('transferencia', 'cheque', 'efectivo')),
  fecha       date NOT NULL DEFAULT current_date,
  referencia  text,          -- folio del cheque, clave de rastreo…
  notas       text,
  created_by  text NOT NULL DEFAULT public.requesting_user_id(),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX compra_pagos_compra_idx ON public.compra_pagos (compra_id);

-- One place that knows the arithmetic, so no screen re-derives it differently.
-- Base is the invoice's stated total; if it was never typed, fall back to the
-- captured lines so a purchase still shows a real balance.
CREATE OR REPLACE VIEW public.compras_saldo AS
  SELECT c.id AS compra_id,
         c.proveedor_id,
         c.estado,
         GREATEST(c.total_factura_cents,
                  coalesce((SELECT sum(ci.line_total_cents) FROM public.compra_items ci
                             WHERE ci.compra_id = c.id), 0)) AS base_cents,
         coalesce((SELECT sum(n.monto_cents) FROM public.compra_notas_credito n
                    WHERE n.compra_id = c.id), 0) AS notas_cents,
         coalesce((SELECT sum(p.monto_cents) FROM public.compra_pagos p
                    WHERE p.compra_id = c.id), 0) AS pagado_cents,
         GREATEST(c.total_factura_cents,
                  coalesce((SELECT sum(ci.line_total_cents) FROM public.compra_items ci
                             WHERE ci.compra_id = c.id), 0))
           - coalesce((SELECT sum(n.monto_cents) FROM public.compra_notas_credito n
                        WHERE n.compra_id = c.id), 0)
           - coalesce((SELECT sum(p.monto_cents) FROM public.compra_pagos p
                        WHERE p.compra_id = c.id), 0) AS saldo_cents
    FROM public.compras c;

GRANT SELECT ON public.compras_saldo TO authenticated;

-- Register a credit note. When it names products it also returns that stock, in
-- the same transaction — the whole point is that inventory matches what really
-- arrived. p_items = [{product_id, qty, costo_unitario_cents}].
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
  v_uid    text := public.requesting_user_id();
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

      -- Goods leave: what was never delivered (or went back) can't stay counted.
      -- products' CHECK (quantity >= 0) refuses if it was already sold onward.
      INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
      VALUES ((v_item->>'product_id')::uuid, -v_qty, 'purchase_return', p_compra_id, v_uid);
    END LOOP;
  END IF;

  RETURN v_nota;
END;
$$;

ALTER TABLE public.compra_notas_credito ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compra_nota_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compra_pagos         ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin all compra_notas" ON public.compra_notas_credito
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin all compra_nota_items" ON public.compra_nota_items
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin all compra_pagos" ON public.compra_pagos
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compra_notas_credito TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compra_nota_items    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compra_pagos         TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_nota_credito(uuid, text, text, jsonb, bigint) TO authenticated;
