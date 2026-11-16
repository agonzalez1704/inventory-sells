-- A WhatsApp quote stays open for that number while it is 'pendiente': it
-- keeps taking pieces until a seller converts it into a sale (or the customer
-- pays it, which authorizes it, or it is cancelled). The 6-hour window split a
-- mechanic's morning and afternoon into separate quotes — or, worse, joined
-- them when they fell inside it; mechanics rarely say goodbye.
-- Only the newest pending quote per almacén is open: older ones stay pending
-- for the sellers, but the agent no longer writes into them.
CREATE OR REPLACE FUNCTION public.cotizaciones_wa_vivas(p_telefono text)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT DISTINCT ON (coalesce(c.inventory_id, public.inventario_mostrador())) c.id
    FROM public.cotizaciones c
   WHERE c.canal = 'whatsapp'
     AND c.estado = 'pendiente'
     AND c.notas = 'WhatsApp: ' || p_telefono
   ORDER BY coalesce(c.inventory_id, public.inventario_mostrador()), c.created_at DESC;
$function$;
