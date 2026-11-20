-- Crédito que se puede bloquear, liberar por un día, y una ficha de cliente
-- más completa (pedido de Refaccionaria Ruli, 2026-11-20).
--
--   * numero: el número de cliente del negocio. Se asigna solo (el siguiente
--     después del más alto) y se puede cambiar para conservar los números de
--     antes. Único.
--   * encargado / direccion / referencias / ubicacion / inventory_id (ruta o
--     almacén que lo surte) / forma_pago: datos del alta.
--   * bloqueo_motivo: bloqueo manual (solo admin).
--   * credito_liberado_hasta/_por: "liberar por hoy" (solo admin, por RPC).
--
-- La regla vive en credito_bloqueo(): la usan register_loan (nota a crédito en
-- caja) y convertir_cotizacion (la cotización sale como nota pendiente).
-- Bloquear por notas vencidas es decisión de cada negocio:
-- config_negocio.credito_bloquea_vencidas (apagado por defecto). El tope de
-- crédito sigue aplicando como antes; una liberación del día lo salta.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS numero int CHECK (numero IS NULL OR numero > 0),
  ADD COLUMN IF NOT EXISTS encargado text,
  ADD COLUMN IF NOT EXISTS direccion text,
  ADD COLUMN IF NOT EXISTS referencias text,
  ADD COLUMN IF NOT EXISTS ubicacion text,
  ADD COLUMN IF NOT EXISTS inventory_id uuid REFERENCES public.inventories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forma_pago text
    CHECK (forma_pago IS NULL OR forma_pago IN ('contado', 'contra_entrega', 'credito')),
  ADD COLUMN IF NOT EXISTS bloqueo_motivo text,
  ADD COLUMN IF NOT EXISTS credito_liberado_hasta date,
  ADD COLUMN IF NOT EXISTS credito_liberado_por text;

COMMENT ON COLUMN public.customers.numero IS 'Número de cliente del negocio. Automático, editable, único.';
COMMENT ON COLUMN public.customers.bloqueo_motivo IS 'Bloqueo manual de crédito (admin). NULL = sin bloqueo manual.';
COMMENT ON COLUMN public.customers.credito_liberado_hasta IS 'Liberado por un admin: puede llevar a crédito hasta esta fecha (hora de México).';

ALTER TABLE public.config_negocio
  ADD COLUMN IF NOT EXISTS credito_bloquea_vencidas boolean NOT NULL DEFAULT false;

-- Numbers for everyone who already exists, oldest first.
UPDATE public.customers c SET numero = s.n
FROM (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
  FROM public.customers WHERE NOT is_system AND numero IS NULL
) s
WHERE c.id = s.id;

CREATE UNIQUE INDEX IF NOT EXISTS customers_numero_key
  ON public.customers (numero) WHERE numero IS NOT NULL;

-- New customers take the next number after the highest, and only an admin
-- touches the block / the day's release.
CREATE OR REPLACE FUNCTION public.customers_antes_de_guardar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.numero IS NULL AND NOT NEW.is_system THEN
      PERFORM pg_advisory_xact_lock(hashtext('customers_numero'));
      SELECT coalesce(max(numero), 0) + 1 INTO NEW.numero FROM public.customers;
    END IF;
    IF (NEW.bloqueo_motivo IS NOT NULL OR NEW.credito_liberado_hasta IS NOT NULL)
       AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'solo un administrador puede bloquear o liberar crédito' USING errcode = '42501';
    END IF;
  ELSIF (NEW.bloqueo_motivo IS DISTINCT FROM OLD.bloqueo_motivo
         OR NEW.credito_liberado_hasta IS DISTINCT FROM OLD.credito_liberado_hasta
         OR NEW.credito_liberado_por IS DISTINCT FROM OLD.credito_liberado_por)
        AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'solo un administrador puede bloquear o liberar crédito' USING errcode = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customers_antes_de_guardar ON public.customers;
CREATE TRIGGER customers_antes_de_guardar
  BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_antes_de_guardar();

-- Where one customer's credit stands today. Overdue = a pending note older
-- than the customer's credito_dias (no plazo → never overdue).
CREATE OR REPLACE FUNCTION public.credito_estado(p_customer_id uuid)
RETURNS TABLE (
  deuda_cents     bigint,
  vencido_cents   bigint,
  notas_vencidas  int,
  dias_mas_vieja  int,
  liberado_hoy    boolean,
  bloqueo_motivo  text,
  limite_cents    bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH c AS (SELECT * FROM public.customers WHERE id = p_customer_id),
  hoy AS (SELECT (now() AT TIME ZONE 'America/Mexico_City')::date AS d),
  notas AS (
    SELECT s.total_cents - coalesce((
             SELECT sum(sp.monto_cents) FROM public.sale_pagos sp WHERE sp.sale_id = s.id
           ), 0) AS saldo,
           (s.created_at AT TIME ZONE 'America/Mexico_City')::date + c.credito_dias AS vence
    FROM public.sales s JOIN c ON s.customer_id = c.id
    WHERE s.status = 'pending' AND s.importe_cents IS NULL
  )
  SELECT
    coalesce(sum(n.saldo), 0)::bigint,
    coalesce(sum(n.saldo) FILTER (WHERE n.vence < hoy.d AND n.saldo > 0), 0)::bigint,
    (count(n.saldo) FILTER (WHERE n.vence < hoy.d AND n.saldo > 0))::int,
    coalesce(max(hoy.d - n.vence) FILTER (WHERE n.vence < hoy.d AND n.saldo > 0), 0)::int,
    coalesce(c.credito_liberado_hasta >= hoy.d, false),
    c.bloqueo_motivo,
    c.credito_limite_cents
  FROM c CROSS JOIN hoy LEFT JOIN notas n ON true
  GROUP BY c.credito_liberado_hasta, c.bloqueo_motivo, c.credito_limite_cents, hoy.d;
$$;
REVOKE EXECUTE ON FUNCTION public.credito_estado(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.credito_estado(uuid) TO authenticated;

-- Why this customer can't take p_monto more on credit right now; NULL = can.
CREATE OR REPLACE FUNCTION public.credito_bloqueo(p_customer_id uuid, p_monto bigint)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  e        record;
  v_vencen boolean;
BEGIN
  SELECT * INTO e FROM public.credito_estado(p_customer_id);
  IF NOT FOUND OR e.liberado_hoy THEN RETURN NULL; END IF;

  IF e.bloqueo_motivo IS NOT NULL THEN
    RETURN 'bloqueado por el admin: ' || e.bloqueo_motivo;
  END IF;

  SELECT coalesce(credito_bloquea_vencidas, false) INTO v_vencen
  FROM public.config_negocio WHERE id = 1;
  IF coalesce(v_vencen, false) AND e.notas_vencidas > 0 THEN
    RETURN format('tiene %s nota%s vencida%s por $%s (la más vieja, hace %s días)',
      e.notas_vencidas,
      CASE WHEN e.notas_vencidas = 1 THEN '' ELSE 's' END,
      CASE WHEN e.notas_vencidas = 1 THEN '' ELSE 's' END,
      to_char(e.vencido_cents / 100.0, 'FM999,999,990.00'), e.dias_mas_vieja);
  END IF;

  IF e.limite_cents IS NOT NULL AND e.deuda_cents + p_monto > e.limite_cents THEN
    RETURN format('excede su límite: debe $%s y esta nota son $%s (límite $%s)',
      to_char(e.deuda_cents / 100.0, 'FM999,999,990.00'),
      to_char(p_monto / 100.0, 'FM999,999,990.00'),
      to_char(e.limite_cents / 100.0, 'FM999,999,990.00'));
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.credito_bloqueo(uuid, bigint) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.credito_bloqueo(uuid, bigint) TO authenticated;

-- "Liberar por hoy": an admin lets a good customer take credit until midnight.
CREATE OR REPLACE FUNCTION public.liberar_credito_hoy(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'solo un administrador puede liberar crédito' USING errcode = '42501';
  END IF;
  UPDATE public.customers
     SET credito_liberado_hasta = (now() AT TIME ZONE 'America/Mexico_City')::date,
         credito_liberado_por   = public.requesting_user_id()
   WHERE id = p_customer_id AND NOT is_system;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cliente no encontrado' USING errcode = '23514';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.liberar_credito_hoy(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.liberar_credito_hoy(uuid) TO authenticated;

-- register_loan: same as 20261015130000, the limit check now goes through
-- credito_bloqueo (block, overdue, limit; released for the day skips all).

CREATE OR REPLACE FUNCTION public.register_loan(p_items jsonb, p_customer_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_descuento_pct numeric DEFAULT NULL::numeric, p_importe_cents integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid          text := public.requesting_user_id();
  v_sale_id      uuid;
  v_item         jsonb;
  v_product      public.products%ROWTYPE;
  v_qty          int;
  v_unit         int;
  v_line_total   int;
  v_total        int := 0;
  v_cust         public.customers%ROWTYPE;
  v_exige        boolean;
  v_nota         text := NULLIF(btrim(p_note), '');
  v_bloqueo      text;
  v_pct          numeric;
  v_origen       text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'no items';
  END IF;
  IF p_importe_cents IS NOT NULL AND p_importe_cents <= 0 THEN
    RAISE EXCEPTION 'importe inválido' USING errcode = '23514';
  END IF;

  SELECT coalesce(fiado_exige_cliente, true) INTO v_exige
  FROM public.config_negocio WHERE id = 1;
  v_exige := coalesce(v_exige, true);

  IF p_customer_id IS NULL THEN
    IF v_exige THEN
      RAISE EXCEPTION 'un crédito necesita cliente: elige a quién se le fía'
        USING errcode = '23514';
    END IF;
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
    IF v_nota IS NULL OR length(v_nota) < 5 THEN
      RAISE EXCEPTION 'fiado a Mostrador: escribe en la nota quién debe (nombre, teléfono o seña)'
        USING errcode = '23514';
    END IF;
  END IF;

  SELECT d.pct, d.origen INTO v_pct, v_origen FROM public.descuento_de_venta(v_cust.id, p_descuento_pct) d;

  INSERT INTO public.sales (status, payment_method, note, customer_id, customer_name, sold_by, total_cents, descuento_pct, descuento_origen, importe_cents)
  VALUES ('pending', NULL, v_nota, v_cust.id, v_cust.nombre, v_uid, 0, v_pct, v_origen, p_importe_cents)
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

    v_unit := round(v_product.price_cents * (100 - v_pct) / 100.0)::int;
    v_line_total := v_unit * v_qty;
    v_total := v_total + v_line_total;

    INSERT INTO public.sale_items (sale_id, product_id, qty, unit_price_cents, line_total_cents, precio_lista_cents)
    VALUES (v_sale_id, v_product.id, v_qty, v_unit, v_line_total, v_product.price_cents);

    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
    VALUES (v_product.id, -v_qty, 'sale', v_sale_id, v_uid);
  END LOOP;

  -- The guarantee covers the note; a smaller one is just a partial payment
  -- and belongs in abonos.
  IF p_importe_cents IS NOT NULL AND p_importe_cents < v_total THEN
    RAISE EXCEPTION 'el importe ($%) debe cubrir la nota ($%)',
      round(p_importe_cents / 100.0, 2), round(v_total / 100.0, 2) USING errcode = '23514';
  END IF;

  -- A note covered by an importe is no risk: it skips the credit rules.
  IF p_importe_cents IS NULL THEN
    v_bloqueo := public.credito_bloqueo(v_cust.id, v_total);
    IF v_bloqueo IS NOT NULL THEN
      RAISE EXCEPTION 'crédito bloqueado: %', v_bloqueo USING errcode = '23514';
    END IF;
  END IF;

  UPDATE public.sales SET total_cents = v_total WHERE id = v_sale_id;
  RETURN v_sale_id;
END;
$function$;

-- convertir_cotizacion: the quote leaves as a pending note, so the same rule
-- decides whether it can go out. Body otherwise as 20260728162000.
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
  v_bloqueo text;
BEGIN
  SELECT * INTO v_c FROM public.cotizaciones WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cotización no encontrada'; END IF;
  IF v_c.estado = 'convertida' THEN RETURN v_c.sale_id; END IF;   -- idempotent
  IF v_c.estado <> 'autorizada' THEN RAISE EXCEPTION 'la cotización no está autorizada'; END IF;

  IF v_c.customer_id IS NOT NULL THEN
    SELECT nombre INTO v_cust FROM public.customers WHERE id = v_c.customer_id;
    v_bloqueo := public.credito_bloqueo(v_c.customer_id, v_c.total_cents);
    IF v_bloqueo IS NOT NULL THEN
      RAISE EXCEPTION 'crédito bloqueado: %', v_bloqueo USING errcode = '23514';
    END IF;
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
