-- Dropshipping: products we list but never hold. They live in an inventory
-- flagged es_dropship; the supplier (AliExpress or otherwise) ships straight to
-- the customer, and our margin is the difference between price and cost.
--
-- The storefront's load-bearing invariant is reserve-at-order-creation
-- ('reserva' movement in crear_orden_web, released by cancelar_orden_web). A
-- dropshipped line has no stock to reserve, so the flag EXEMPTS it from that
-- machinery — deliberately not faked with quantity=999, which would poison
-- inventory value and every stock statistic.

ALTER TABLE public.inventories
  ADD COLUMN IF NOT EXISTS es_dropship boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.inventories.es_dropship IS
  'Se surte del proveedor directo al cliente: sin stock propio, sin reserva.';

-- Supplier listing URL — the staff''s one-click path to place the order.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS enlace_proveedor text;

-- Fulfillment state for the dropship block of a paid order. NULL = the order
-- has no dropship items. 'por_pedir' is set by pagar_orden_web the moment the
-- customer's money lands — that is when the shop can spend it with the
-- supplier. 'pedido' is set by staff with the supplier's order number.
ALTER TABLE public.ordenes_web
  ADD COLUMN IF NOT EXISTS dropship_estado text
    CHECK (dropship_estado IS NULL OR dropship_estado IN ('por_pedir', 'pedido')),
  ADD COLUMN IF NOT EXISTS dropship_ref text,
  ADD COLUMN IF NOT EXISTS dropship_pedido_at timestamptz;

-- ---------------------------------------------------------------------------
-- crear_orden_web: dropship items skip the stock check and the reserva.
CREATE OR REPLACE FUNCTION public.crear_orden_web(
  p_items jsonb, p_nombre text, p_email text, p_telefono text, p_cp text,
  p_estado text, p_municipio text, p_direccion text, p_referencias text,
  p_envio_cents integer, p_envio_desc text, p_tipo_entrega text
)
RETURNS TABLE(orden_id uuid, folio text, subtotal_cents integer, total_cents integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_id       uuid;
  v_folio    text;
  v_item     jsonb;
  v_prod     public.products%ROWTYPE;
  v_drop     boolean;
  v_qty      int;
  v_subtotal int := 0;
  v_recoger  boolean := (p_tipo_entrega = 'recoger');
BEGIN
  IF p_tipo_entrega NOT IN ('envio', 'recoger') THEN
    RAISE EXCEPTION 'tipo de entrega inválido';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'carrito vacío';
  END IF;
  IF coalesce(btrim(p_nombre), '') = '' OR coalesce(btrim(p_email), '') = ''
     OR coalesce(btrim(p_telefono), '') = '' THEN
    RAISE EXCEPTION 'faltan datos del cliente';
  END IF;
  IF NOT v_recoger THEN
    IF p_cp !~ '^\d{5}$' THEN RAISE EXCEPTION 'código postal inválido'; END IF;
    IF p_envio_cents IS NULL OR p_envio_cents < 0 THEN RAISE EXCEPTION 'envío inválido'; END IF;
  END IF;

  v_folio := 'LD-' || to_char(nextval('public.orden_web_seq'), 'FM000000');

  INSERT INTO public.ordenes_web (
    folio, nombre, email, telefono, cp, estado, municipio, direccion, referencias,
    envio_cents, envio_desc, subtotal_cents, total_cents, tipo_entrega
  ) VALUES (
    v_folio, btrim(p_nombre), btrim(p_email), btrim(p_telefono),
    CASE WHEN v_recoger THEN NULL ELSE p_cp END,
    CASE WHEN v_recoger THEN NULL ELSE p_estado END,
    CASE WHEN v_recoger THEN NULL ELSE p_municipio END,
    CASE WHEN v_recoger THEN NULL ELSE p_direccion END,
    NULLIF(btrim(coalesce(p_referencias, '')), ''),
    CASE WHEN v_recoger THEN 0 ELSE p_envio_cents END,
    CASE WHEN v_recoger THEN 'Recoger en tienda' ELSE p_envio_desc END,
    0, 0, p_tipo_entrega
  ) RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'qty')::int;
    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'cantidad inválida'; END IF;

    SELECT * INTO v_prod FROM public.products
    WHERE id = (v_item->>'product_id')::uuid AND is_active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'producto no disponible'; END IF;

    SELECT coalesce(i.es_dropship, false) INTO v_drop
    FROM public.inventories i WHERE i.id = v_prod.inventory_id;
    v_drop := coalesce(v_drop, false);

    -- The supplier's shelf is not ours to count: no stock gate, no reserva.
    IF NOT v_drop THEN
      IF v_prod.quantity < v_qty THEN
        RAISE EXCEPTION 'Ya no tenemos suficiente stock de %', v_prod.name
          USING errcode = '23514';
      END IF;
      INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
      VALUES (v_prod.id, -v_qty, 'reserva', v_id, 'online');
    END IF;

    INSERT INTO public.orden_web_items (orden_id, product_id, nombre, qty, unit_price_cents)
    VALUES (v_id, v_prod.id, v_prod.name, v_qty, v_prod.price_cents);

    v_subtotal := v_subtotal + v_prod.price_cents * v_qty;
  END LOOP;

  UPDATE public.ordenes_web
     SET subtotal_cents = v_subtotal,
         total_cents = v_subtotal + (CASE WHEN v_recoger THEN 0 ELSE p_envio_cents END)
   WHERE id = v_id;

  RETURN QUERY SELECT v_id, v_folio, v_subtotal,
    v_subtotal + (CASE WHEN v_recoger THEN 0 ELSE p_envio_cents END);
END;
$$;

-- ---------------------------------------------------------------------------
-- cancelar_orden_web: only lines that were actually reserved get returned.
CREATE OR REPLACE FUNCTION public.cancelar_orden_web(p_orden_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_o    public.ordenes_web%ROWTYPE;
  v_item record;
BEGIN
  SELECT * INTO v_o FROM public.ordenes_web WHERE id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'orden no encontrada'; END IF;
  IF v_o.status <> 'pendiente' THEN RETURN; END IF;   -- idempotent

  FOR v_item IN
    SELECT owi.product_id, owi.qty
    FROM public.orden_web_items owi
    JOIN public.products p ON p.id = owi.product_id
    LEFT JOIN public.inventories i ON i.id = p.inventory_id
    WHERE owi.orden_id = p_orden_id AND NOT coalesce(i.es_dropship, false)
  LOOP
    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
    VALUES (v_item.product_id, v_item.qty, 'return', p_orden_id, 'online');
  END LOOP;

  UPDATE public.ordenes_web SET status = 'cancelada' WHERE id = p_orden_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- pagar_orden_web: a paid order with dropship items is ready to order upstream.
CREATE OR REPLACE FUNCTION public.pagar_orden_web(p_orden_id uuid, p_conekta_id text, p_metodo text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_o       public.ordenes_web%ROWTYPE;
  v_sale_id uuid;
  v_pm      text;
  v_item    record;
  v_drop    boolean;
BEGIN
  SELECT * INTO v_o FROM public.ordenes_web WHERE id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'orden no encontrada'; END IF;
  IF v_o.status = 'pagada' THEN RETURN v_o.sale_id; END IF;
  IF v_o.status = 'cancelada' THEN RAISE EXCEPTION 'orden cancelada'; END IF;

  v_pm := CASE p_metodo
            WHEN 'card' THEN 'tarjeta'
            WHEN 'spei' THEN 'transferencia'
            WHEN 'transferencia' THEN 'transferencia'
            ELSE 'otro'          -- oxxo, aplazo
          END;

  INSERT INTO public.sales (status, payment_method, customer_name, sold_by,
                            total_cents, canal, note)
  VALUES ('completed', v_pm, v_o.nombre, 'online', v_o.subtotal_cents, 'online',
          'Orden ' || v_o.folio)
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT product_id, qty, unit_price_cents FROM public.orden_web_items
                WHERE orden_id = p_orden_id
  LOOP
    INSERT INTO public.sale_items (sale_id, product_id, qty, unit_price_cents, line_total_cents)
    VALUES (v_sale_id, v_item.product_id, v_item.qty, v_item.unit_price_cents,
            v_item.unit_price_cents * v_item.qty);
  END LOOP;

  SELECT EXISTS (
    SELECT 1 FROM public.orden_web_items owi
    JOIN public.products p ON p.id = owi.product_id
    JOIN public.inventories i ON i.id = p.inventory_id AND i.es_dropship
    WHERE owi.orden_id = p_orden_id
  ) INTO v_drop;

  UPDATE public.ordenes_web
     SET status = 'pagada', paid_at = now(), sale_id = v_sale_id,
         metodo = coalesce(p_metodo, metodo),
         conekta_order_id = coalesce(p_conekta_id, conekta_order_id),
         dropship_estado = CASE WHEN v_drop THEN 'por_pedir' ELSE dropship_estado END
   WHERE id = p_orden_id;

  RETURN v_sale_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- tienda_modelos: a dropship variant is available by definition — the supplier
-- holds the stock. 'ultima' never applies to it.
CREATE OR REPLACE FUNCTION public.tienda_modelos(
  p_marca     text,
  p_categoria text,
  p_calidad   text,
  p_limit     integer,
  p_offset    integer
)
RETURNS TABLE (
  modelo      text,
  brand       text,
  category    text,
  imagen      text,
  desde_cents integer,
  variantes   jsonb,
  mas_vendida uuid,
  total       bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH vendidas AS (
    SELECT si.product_id, sum(si.qty) AS piezas
      FROM public.sale_items si
      JOIN public.sales s ON s.id = si.sale_id AND s.status = 'completed'
     GROUP BY si.product_id
  ),
  filtrados AS (
    SELECT p.*, i.entrega_dias_habiles, coalesce(i.es_dropship, false) AS es_dropship
      FROM public.products p
      LEFT JOIN public.inventories i ON i.id = p.inventory_id
     WHERE p.is_active
       AND (p_marca     IS NULL OR p.brand    = p_marca)
       AND (p_categoria IS NULL OR p.category = p_categoria)
       AND (p_calidad   IS NULL OR p.calidad  = p_calidad)
  ),
  agrupados AS (
    SELECT
      f.modelo,
      f.brand,
      f.category,
      (array_remove(array_agg(f.image_url ORDER BY f.image_url), NULL))[1] AS imagen,
      min(f.price_cents) FILTER (WHERE f.price_cents > 0) AS desde_cents,
      max((f.quantity > 0 OR f.es_dropship)::int) AS hay_stock,
      max((f.price_cents > 0)::int) AS hay_precio,
      jsonb_agg(
        jsonb_build_object(
          'id', f.id,
          'nombre', f.name,
          'calidad', f.calidad,
          'precio_cents', f.price_cents,
          'disponible', f.quantity > 0 OR f.es_dropship,
          'ultima', f.quantity = 1 AND NOT f.es_dropship,
          'imagen', f.image_url,
          'entrega_dias', f.entrega_dias_habiles
        )
        ORDER BY f.price_cents, f.name
      ) AS variantes,
      (array_agg(f.id ORDER BY coalesce(v.piezas, 0) DESC, f.price_cents))[1] AS mejor,
      max(coalesce(v.piezas, 0)) AS piezas_top
    FROM filtrados f
    LEFT JOIN vendidas v ON v.product_id = f.id
    GROUP BY f.modelo, f.brand, f.category
  )
  SELECT a.modelo, a.brand, a.category, a.imagen, a.desde_cents, a.variantes,
         CASE WHEN a.piezas_top > 0 THEN a.mejor END AS mas_vendida,
         count(*) OVER () AS total
    FROM agrupados a
   ORDER BY a.hay_stock DESC, a.hay_precio DESC, a.modelo
   LIMIT p_limit OFFSET p_offset;
$$;
