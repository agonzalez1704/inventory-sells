-- Adelantos: the customer pays in advance (abonos) for a product taken later.
-- Two types: 'apartado' (in stock, reserved now) or 'pedido' (special order,
-- out of stock / not in the catalog). Partial payments by any method.

-- Reservations remove a unit from available stock — a distinct ledger reason.
ALTER TABLE public.inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_reason_check;
ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_reason_check
  CHECK (reason IN ('import', 'sale', 'adjustment', 'return', 'reserva'));

CREATE TABLE public.adelantos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         text NOT NULL CHECK (tipo IN ('apartado', 'pedido')),
  product_id   uuid REFERENCES public.products(id),
  descripcion  text,
  qty          int  NOT NULL DEFAULT 1 CHECK (qty > 0),
  precio_cents int  NOT NULL CHECK (precio_cents > 0),
  cliente      text,
  estado       text NOT NULL DEFAULT 'activo'
                 CHECK (estado IN ('activo', 'entregado', 'cancelado')),
  created_by   text NOT NULL DEFAULT public.requesting_user_id(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  entregado_at timestamptz,
  -- must identify the product somehow; an 'apartado' needs a catalog product to reserve.
  CONSTRAINT adelanto_identificado CHECK (product_id IS NOT NULL OR descripcion IS NOT NULL),
  CONSTRAINT apartado_con_producto CHECK (tipo <> 'apartado' OR product_id IS NOT NULL)
);
CREATE INDEX adelantos_estado_idx     ON public.adelantos (estado);
CREATE INDEX adelantos_created_at_idx ON public.adelantos (created_at);

CREATE TRIGGER adelantos_touch_updated_at
  BEFORE UPDATE ON public.adelantos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.adelanto_pagos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adelanto_id uuid NOT NULL REFERENCES public.adelantos(id) ON DELETE CASCADE,
  monto_cents int  NOT NULL CHECK (monto_cents > 0),
  metodo      text NOT NULL
                CHECK (metodo IN ('efectivo', 'tarjeta', 'transferencia', 'otro')),
  -- 'abono' = cash in; 'devolucion' = cash refunded on cancel.
  tipo        text NOT NULL DEFAULT 'abono' CHECK (tipo IN ('abono', 'devolucion')),
  created_by  text NOT NULL DEFAULT public.requesting_user_id(),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX adelanto_pagos_adelanto_idx   ON public.adelanto_pagos (adelanto_id);
CREATE INDEX adelanto_pagos_created_at_idx ON public.adelanto_pagos (created_at);

ALTER TABLE public.adelantos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adelanto_pagos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read adelantos"
  ON public.adelantos FOR SELECT TO authenticated
  USING (public.requesting_user_id() IS NOT NULL);
CREATE POLICY "authenticated read adelanto_pagos"
  ON public.adelanto_pagos FOR SELECT TO authenticated
  USING (public.requesting_user_id() IS NOT NULL);

-- All writes go through the SECURITY DEFINER RPCs below.
GRANT SELECT ON public.adelantos      TO authenticated;
GRANT SELECT ON public.adelanto_pagos TO authenticated;

-- Net amount paid so far on an adelanto (abonos − devoluciones).
CREATE OR REPLACE FUNCTION public.adelanto_pagado(p_adelanto_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT COALESCE(SUM(CASE WHEN tipo = 'abono' THEN monto_cents ELSE -monto_cents END), 0)::int
  FROM public.adelanto_pagos WHERE adelanto_id = p_adelanto_id;
$$;

-- Create an adelanto (optionally with a first abono). Reserves stock for an
-- 'apartado'.
CREATE OR REPLACE FUNCTION public.crear_adelanto(
  p_tipo         text,
  p_product_id   uuid,
  p_descripcion  text,
  p_qty          int,
  p_precio_cents int,
  p_cliente      text,
  p_abono_cents  int,
  p_abono_metodo text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid text := public.requesting_user_id();
  v_id  uuid;
  v_qty int := COALESCE(p_qty, 1);
  v_stock int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING errcode = '28000'; END IF;
  IF p_tipo NOT IN ('apartado','pedido') THEN RAISE EXCEPTION 'tipo inválido'; END IF;
  IF p_precio_cents IS NULL OR p_precio_cents <= 0 THEN RAISE EXCEPTION 'precio inválido'; END IF;
  IF v_qty <= 0 THEN RAISE EXCEPTION 'cantidad inválida'; END IF;
  IF p_tipo = 'apartado' AND p_product_id IS NULL THEN
    RAISE EXCEPTION 'un apartado necesita un producto del catálogo';
  END IF;
  IF p_product_id IS NULL AND (p_descripcion IS NULL OR btrim(p_descripcion) = '') THEN
    RAISE EXCEPTION 'indica un producto o una descripción';
  END IF;
  IF p_abono_cents IS NOT NULL AND p_abono_cents > p_precio_cents THEN
    RAISE EXCEPTION 'el abono no puede ser mayor al precio';
  END IF;

  -- Reserve stock for an apartado (unit leaves available inventory now).
  IF p_tipo = 'apartado' THEN
    SELECT quantity INTO v_stock FROM public.products WHERE id = p_product_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'producto no encontrado'; END IF;
    IF v_stock < v_qty THEN
      RAISE EXCEPTION 'sin stock suficiente para apartar (hay %, necesita %)', v_stock, v_qty
        USING errcode = '23514';
    END IF;
  END IF;

  INSERT INTO public.adelantos (tipo, product_id, descripcion, qty, precio_cents, cliente, created_by)
  VALUES (p_tipo, p_product_id, NULLIF(btrim(p_descripcion), ''), v_qty, p_precio_cents,
          NULLIF(btrim(p_cliente), ''), v_uid)
  RETURNING id INTO v_id;

  IF p_tipo = 'apartado' THEN
    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
    VALUES (p_product_id, -v_qty, 'reserva', v_id, v_uid);
  END IF;

  IF p_abono_cents IS NOT NULL AND p_abono_cents > 0 THEN
    IF p_abono_metodo IS NULL OR p_abono_metodo NOT IN ('efectivo','tarjeta','transferencia','otro') THEN
      RAISE EXCEPTION 'método de abono inválido';
    END IF;
    INSERT INTO public.adelanto_pagos (adelanto_id, monto_cents, metodo, created_by)
    VALUES (v_id, p_abono_cents, p_abono_metodo, v_uid);
  END IF;

  RETURN v_id;
END;
$$;

-- Add an abono (partial payment). Never exceeds the price.
CREATE OR REPLACE FUNCTION public.abonar_adelanto(
  p_adelanto_id uuid,
  p_monto_cents int,
  p_metodo      text
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid    text := public.requesting_user_id();
  v_estado text;
  v_precio int;
  v_pagado int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING errcode = '28000'; END IF;
  IF p_monto_cents IS NULL OR p_monto_cents <= 0 THEN RAISE EXCEPTION 'monto inválido'; END IF;
  IF p_metodo IS NULL OR p_metodo NOT IN ('efectivo','tarjeta','transferencia','otro') THEN
    RAISE EXCEPTION 'método inválido';
  END IF;

  SELECT estado, precio_cents INTO v_estado, v_precio
  FROM public.adelantos WHERE id = p_adelanto_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'adelanto no encontrado'; END IF;
  IF v_estado <> 'activo' THEN RAISE EXCEPTION 'el adelanto no está activo (%)', v_estado; END IF;

  v_pagado := public.adelanto_pagado(p_adelanto_id);
  IF v_pagado + p_monto_cents > v_precio THEN
    RAISE EXCEPTION 'el abono excede lo que falta (pagado %, precio %)', v_pagado, v_precio;
  END IF;

  INSERT INTO public.adelanto_pagos (adelanto_id, monto_cents, metodo, created_by)
  VALUES (p_adelanto_id, p_monto_cents, p_metodo, v_uid);

  RETURN v_pagado + p_monto_cents;
END;
$$;

-- Deliver a fully-paid adelanto. For a 'pedido' with a catalog product, stock
-- leaves now (it must have been restocked). An 'apartado' already left at reserve.
CREATE OR REPLACE FUNCTION public.entregar_adelanto(p_adelanto_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid  text := public.requesting_user_id();
  v_ad   public.adelantos%ROWTYPE;
  v_stock int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING errcode = '28000'; END IF;
  SELECT * INTO v_ad FROM public.adelantos WHERE id = p_adelanto_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'adelanto no encontrado'; END IF;
  IF v_ad.estado <> 'activo' THEN RAISE EXCEPTION 'el adelanto no está activo (%)', v_ad.estado; END IF;
  IF public.adelanto_pagado(p_adelanto_id) < v_ad.precio_cents THEN
    RAISE EXCEPTION 'aún no está pagado por completo';
  END IF;

  IF v_ad.tipo = 'pedido' AND v_ad.product_id IS NOT NULL THEN
    SELECT quantity INTO v_stock FROM public.products WHERE id = v_ad.product_id FOR UPDATE;
    IF v_stock < v_ad.qty THEN
      RAISE EXCEPTION 'sin stock para entregar (hay %, necesita %)', v_stock, v_ad.qty
        USING errcode = '23514';
    END IF;
    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
    VALUES (v_ad.product_id, -v_ad.qty, 'sale', p_adelanto_id, v_uid);
  END IF;

  UPDATE public.adelantos SET estado = 'entregado', entregado_at = now()
  WHERE id = p_adelanto_id;
  RETURN p_adelanto_id;
END;
$$;

-- Cancel an adelanto: return reserved stock and refund the abonos (per method)
-- as a cash outflow.
CREATE OR REPLACE FUNCTION public.cancelar_adelanto(p_adelanto_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid text := public.requesting_user_id();
  v_ad  public.adelantos%ROWTYPE;
  v_row record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING errcode = '28000'; END IF;
  SELECT * INTO v_ad FROM public.adelantos WHERE id = p_adelanto_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'adelanto no encontrado'; END IF;
  IF v_ad.estado <> 'activo' THEN RAISE EXCEPTION 'el adelanto no está activo (%)', v_ad.estado; END IF;

  -- Return the reserved unit(s) to stock.
  IF v_ad.tipo = 'apartado' AND v_ad.product_id IS NOT NULL THEN
    INSERT INTO public.inventory_movements (product_id, delta, reason, ref_id, created_by)
    VALUES (v_ad.product_id, v_ad.qty, 'return', p_adelanto_id, v_uid);
  END IF;

  -- Refund the net paid per method (a cash outflow, dated now).
  FOR v_row IN
    SELECT metodo,
           SUM(CASE WHEN tipo = 'abono' THEN monto_cents ELSE -monto_cents END) AS neto
    FROM public.adelanto_pagos WHERE adelanto_id = p_adelanto_id
    GROUP BY metodo HAVING SUM(CASE WHEN tipo = 'abono' THEN monto_cents ELSE -monto_cents END) > 0
  LOOP
    INSERT INTO public.adelanto_pagos (adelanto_id, monto_cents, metodo, tipo, created_by)
    VALUES (p_adelanto_id, v_row.neto, v_row.metodo, 'devolucion', v_uid);
  END LOOP;

  UPDATE public.adelantos SET estado = 'cancelado' WHERE id = p_adelanto_id;
  RETURN p_adelanto_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.crear_adelanto(text, uuid, text, int, int, text, int, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.abonar_adelanto(uuid, int, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.entregar_adelanto(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancelar_adelanto(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_adelanto(text, uuid, text, int, int, text, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.abonar_adelanto(uuid, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.entregar_adelanto(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_adelanto(uuid) TO authenticated;
