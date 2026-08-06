-- Receiving a restock from a document instead of by hand.
--
-- Three additions, each answering a distinct problem that showed up capturing a
-- real shipment.

-- ---------------------------------------------------------------------------
-- 1. The invoice itself
-- ---------------------------------------------------------------------------
-- The supplier's document (spreadsheet, PDF or a photo of the paper) is what the
-- capture is based on, so it belongs attached to the purchase rather than living
-- in someone's phone. Same storage the product photos use.
ALTER TABLE public.compras
  ADD COLUMN factura_url    text,
  ADD COLUMN factura_key    text,   -- storage object key, for replace/delete
  ADD COLUMN factura_nombre text;   -- original filename, so staff recognise it

-- ---------------------------------------------------------------------------
-- 2. Ordered vs received
-- ---------------------------------------------------------------------------
-- A shipment rarely matches the requisition: it arrives with more, or with less.
-- Until now a line held a single qty, so correcting it to what actually turned up
-- erased what had been ordered — and the far more expensive case, a short
-- delivery, left no trace at all.
--
-- qty stays the received quantity, because that is what moves stock and what the
-- cost layers are built from. qty_pedida is what the requisition asked for, and
-- is NULL when the goods arrived without one.
ALTER TABLE public.compra_items
  ADD COLUMN qty_pedida integer CHECK (qty_pedida IS NULL OR qty_pedida >= 0);

COMMENT ON COLUMN public.compra_items.qty_pedida IS
  'Lo que se pidió. NULL si no hubo requisición. qty es lo que llegó.';

-- ---------------------------------------------------------------------------
-- 3. The supplier's own part numbers
-- ---------------------------------------------------------------------------
-- A supplier invoice lists THEIR code, not ours, so matching a line to a product
-- fails on the first document and would keep failing on every one after it.
-- Recording the equivalence the moment a human corrects a match turns that into
-- a one-time cost per part: the next invoice from the same supplier matches by
-- itself.
--
-- Keyed per supplier, not globally: two suppliers can and do use the same code
-- for different parts, and a global mapping would silently attach stock to the
-- wrong product.
CREATE TABLE public.proveedor_skus (
  proveedor_id  uuid NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  sku_proveedor text NOT NULL,
  product_id    uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_by    text NOT NULL DEFAULT public.requesting_user_id(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proveedor_id, sku_proveedor)
);

CREATE INDEX proveedor_skus_product_idx ON public.proveedor_skus (product_id);

ALTER TABLE public.proveedor_skus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read proveedor_skus"
  ON public.proveedor_skus FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admin write proveedor_skus"
  ON public.proveedor_skus FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proveedor_skus TO authenticated;

-- Record what a human decided, or correct a previous decision. SECURITY DEFINER
-- because the writes come from the admin client, where requesting_user_id() —
-- and therefore the created_by default — resolves to NULL.
CREATE OR REPLACE FUNCTION public.recordar_sku_proveedor(
  p_proveedor_id uuid,
  p_sku          text,
  p_product_id   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_sku text := nullif(btrim(coalesce(p_sku, '')), '');
BEGIN
  IF p_proveedor_id IS NULL OR v_sku IS NULL OR p_product_id IS NULL THEN
    RETURN;  -- nothing worth remembering; not an error
  END IF;
  INSERT INTO public.proveedor_skus (proveedor_id, sku_proveedor, product_id, created_by)
  VALUES (p_proveedor_id, v_sku, p_product_id,
          coalesce(public.requesting_user_id(), 'sistema'))
  ON CONFLICT (proveedor_id, sku_proveedor) DO UPDATE
    SET product_id = EXCLUDED.product_id,
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.recordar_sku_proveedor(uuid, text, uuid) TO authenticated;
