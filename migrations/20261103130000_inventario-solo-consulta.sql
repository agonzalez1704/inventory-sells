-- Inventarios de proveedor, solo consulta (Grob).
--
-- Ruli loads Grob's daily stock file as its own inventory so the counter and
-- the store can see what Grob has. Nothing is sold FROM it: a part Grob has is
-- sold bajo pedido, ordered from Grob, and enters Mostrador with Grob's
-- invoice. Until now any inventory was sellable stock, so 16k Grob rows would
-- have been sold as if they sat on the shelf, and "Por surtir" would have
-- counted them as ours and never ordered anything.

ALTER TABLE public.inventories ADD COLUMN IF NOT EXISTS solo_consulta boolean NOT NULL DEFAULT false;

-- The store never lists a solo-consulta row. tienda_match differs per database
-- (20261103120000_tienda-una-pieza-por-sku groups by SKU only in the auto parts
-- shop), so it is patched in place instead of restated.
DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.tienda_match(jsonb,uuid[])'::regprocedure);
  IF position('solo_consulta' IN d) = 0 THEN
    IF position('WHERE p.is_active' IN d) = 0 THEN
      RAISE EXCEPTION 'tienda_match: no encontré "WHERE p.is_active" para filtrar inventarios de consulta';
    END IF;
    EXECUTE replace(d, 'WHERE p.is_active', 'WHERE p.is_active AND NOT coalesce(i.solo_consulta, false)');
  END IF;
END $do$;
