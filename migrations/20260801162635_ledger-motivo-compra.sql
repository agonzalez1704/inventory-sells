-- The stock ledger's reason list predates purchasing, so receiving an invoice
-- was rejected by its CHECK. Add the two purchase motives: goods received from
-- a supplier, and the reversal when a receipt is cancelled.
--
-- Keeping them as distinct reasons (rather than reusing 'adjustment') is what
-- makes a product's history readable later: the cárdex (R1) has to say a unit
-- came in on invoice F-123, not merely that someone adjusted the count.
ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_reason_check;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_reason_check
  CHECK (reason = ANY (ARRAY[
    'import', 'sale', 'adjustment', 'return', 'reserva',
    'purchase', 'purchase_cancel'
  ]));
