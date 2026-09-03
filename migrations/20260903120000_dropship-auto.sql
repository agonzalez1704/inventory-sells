-- Automatic supplier purchase (fase 2): when a paid order carries dropship
-- items, the app now places the AliExpress order itself. Placing an order
-- SPENDS MONEY, so the claim must be atomic — 'pidiendo' is the in-flight
-- state exactly one caller can win; a Conekta webhook retry or a double click
-- loses the claim and does nothing.

ALTER TABLE public.ordenes_web DROP CONSTRAINT IF EXISTS ordenes_web_dropship_estado_check;
ALTER TABLE public.ordenes_web ADD CONSTRAINT ordenes_web_dropship_estado_check
  CHECK (dropship_estado IS NULL OR dropship_estado IN ('por_pedir', 'pidiendo', 'pedido'));

-- Returns true only for the caller that flipped por_pedir -> pidiendo.
CREATE OR REPLACE FUNCTION public.reclamar_dropship(p_orden_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE public.ordenes_web
     SET dropship_estado = 'pidiendo'
   WHERE id = p_orden_id AND dropship_estado = 'por_pedir';
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.reclamar_dropship(uuid) FROM PUBLIC;
