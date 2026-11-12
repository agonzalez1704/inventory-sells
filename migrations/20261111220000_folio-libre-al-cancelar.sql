-- A cancelled compra no longer holds its invoice number: the team cancels a
-- compra captured wrong and re-captures the same factura. Cancelling is one-way
-- (cancelar_compra refuses a second cancel and nothing un-cancels), so two live
-- compras can still never share a folio.
DROP INDEX IF EXISTS public.compras_folio_uidx;
CREATE UNIQUE INDEX compras_folio_uidx
  ON public.compras (proveedor_id, lower(btrim(folio_factura)))
  WHERE folio_factura IS NOT NULL AND btrim(folio_factura) <> '' AND estado <> 'cancelada';
