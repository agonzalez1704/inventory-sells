-- Physical inventory counts. After the 2026-11-25 theft the shop needs to
-- count a whole inventory and compare it against the system, piece by piece,
-- with the shortage valued at cost and at sale price.
--
-- A count is a document: it opens on one inventory with a snapshot of every
-- active product (what the system said at that moment), people enter what
-- they physically found, and it closes into a report. Nothing moves stock
-- until the count is explicitly applied — and then each difference becomes an
-- ordinary adjustment movement, so the cardex tells the story.
--
-- `esperado` is refreshed at the moment each item is counted: a sale that
-- happens between opening the count and reaching that shelf takes the piece
-- AND the system unit with it, so comparing the physical count against the
-- system number AT COUNT TIME is the honest comparison.

CREATE TABLE IF NOT EXISTS public.conteos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL REFERENCES public.inventories(id),
  nombre text NOT NULL,
  motivo text,
  estado text NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'cerrado', 'aplicado')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  cerrado_at timestamptz,
  cerrado_por text,
  aplicado_at timestamptz,
  aplicado_por text
);
-- One open count per inventory: two people counting the same shelf into two
-- documents would only produce two half-truths.
CREATE UNIQUE INDEX IF NOT EXISTS conteos_abierto_por_inventario
  ON public.conteos (inventory_id) WHERE estado = 'abierto';

CREATE TABLE IF NOT EXISTS public.conteo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conteo_id uuid NOT NULL REFERENCES public.conteos(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  -- System quantity: at opening, then refreshed when the item is counted.
  esperado integer NOT NULL,
  contado integer CHECK (contado IS NULL OR contado >= 0),
  -- Valuation frozen with the count, so the report does not drift when prices change.
  cost_cents integer NOT NULL DEFAULT 0,
  price_cents integer NOT NULL DEFAULT 0,
  contado_por text,
  contado_at timestamptz,
  UNIQUE (conteo_id, product_id)
);
CREATE INDEX IF NOT EXISTS conteo_items_conteo_idx ON public.conteo_items (conteo_id);

ALTER TABLE public.conteos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conteo_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "authenticated read conteos" ON public.conteos
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "authenticated read conteo_items" ON public.conteo_items
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT ON public.conteos, public.conteo_items TO authenticated;

-- Open a count: snapshot every active product of the inventory.
CREATE OR REPLACE FUNCTION public.iniciar_conteo(
  p_inventory uuid,
  p_nombre text,
  p_motivo text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid text := public.requesting_user_id();
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF NOT public.tiene_permiso('inventario_gestionar') THEN
    RAISE EXCEPTION 'sin permiso para abrir un conteo' USING errcode = '42501';
  END IF;
  IF coalesce(btrim(p_nombre), '') = '' THEN
    RAISE EXCEPTION 'ponle nombre al conteo';
  END IF;
  IF EXISTS (SELECT 1 FROM public.conteos WHERE inventory_id = p_inventory AND estado = 'abierto') THEN
    RAISE EXCEPTION 'ese inventario ya tiene un conteo abierto';
  END IF;

  INSERT INTO public.conteos (inventory_id, nombre, motivo, created_by)
  VALUES (p_inventory, btrim(p_nombre), NULLIF(btrim(coalesce(p_motivo, '')), ''), v_uid)
  RETURNING id INTO v_id;

  INSERT INTO public.conteo_items (conteo_id, product_id, esperado, cost_cents, price_cents)
  SELECT v_id, p.id, p.quantity, p.cost_cents, p.price_cents
  FROM public.products p
  WHERE p.inventory_id = p_inventory AND p.is_active;

  RETURN v_id;
END;
$$;

-- "Found N of this": records the physical count next to the system number
-- as it stands right now. Counting is for whoever can SEE the inventory —
-- the person on the ladder is rarely the one with the management permission.
-- A NULL p_contado clears the entry (it was typed on the wrong row).
CREATE OR REPLACE FUNCTION public.contar_item(
  p_conteo uuid,
  p_product_id uuid,
  p_contado integer
)
RETURNS TABLE (esperado integer, contado integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid text := public.requesting_user_id();
  v_qty integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF NOT public.tiene_permiso('inventario_ver') THEN
    RAISE EXCEPTION 'sin permiso para contar' USING errcode = '42501';
  END IF;
  IF p_contado IS NOT NULL AND p_contado < 0 THEN
    RAISE EXCEPTION 'la cantidad no puede ser negativa';
  END IF;
  IF (SELECT c.estado FROM public.conteos c WHERE c.id = p_conteo) IS DISTINCT FROM 'abierto' THEN
    RAISE EXCEPTION 'el conteo ya está cerrado';
  END IF;

  SELECT quantity INTO v_qty FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'producto no encontrado';
  END IF;

  UPDATE public.conteo_items ci
     SET esperado = v_qty,
         contado = p_contado,
         contado_por = CASE WHEN p_contado IS NULL THEN NULL ELSE v_uid END,
         contado_at = CASE WHEN p_contado IS NULL THEN NULL ELSE now() END
   WHERE ci.conteo_id = p_conteo AND ci.product_id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ese producto no está en este conteo';
  END IF;

  RETURN QUERY SELECT v_qty, p_contado;
END;
$$;

-- Close: the count becomes a report. Nothing moves.
CREATE OR REPLACE FUNCTION public.cerrar_conteo(p_conteo uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid text := public.requesting_user_id();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF NOT public.tiene_permiso('inventario_gestionar') THEN
    RAISE EXCEPTION 'sin permiso para cerrar el conteo' USING errcode = '42501';
  END IF;
  UPDATE public.conteos SET estado = 'cerrado', cerrado_at = now(), cerrado_por = v_uid
   WHERE id = p_conteo AND estado = 'abierto';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el conteo no está abierto';
  END IF;
END;
$$;

-- Apply: every counted difference becomes an adjustment movement with the
-- given reason ('robo' after a theft, 'conteo' for a routine count). Items
-- nobody counted are left alone — no number is not zero. The delta is the
-- one measured at count time; movements_apply does the arithmetic.
CREATE OR REPLACE FUNCTION public.aplicar_conteo(p_conteo uuid, p_motivo text DEFAULT 'conteo')
RETURNS TABLE (ajustados integer, piezas integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid text := public.requesting_user_id();
  v_c   public.conteos%ROWTYPE;
  v_n   integer := 0;
  v_pz  integer := 0;
  r     record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF NOT public.tiene_permiso('inventario_gestionar') THEN
    RAISE EXCEPTION 'sin permiso para aplicar el conteo' USING errcode = '42501';
  END IF;
  IF p_motivo IS NULL OR p_motivo NOT IN ('conteo', 'danada', 'robo', 'devolucion', 'otro') THEN
    RAISE EXCEPTION 'motivo inválido';
  END IF;

  SELECT * INTO v_c FROM public.conteos WHERE id = p_conteo FOR UPDATE;
  IF NOT FOUND OR v_c.estado <> 'cerrado' THEN
    RAISE EXCEPTION 'solo se aplica un conteo cerrado';
  END IF;

  FOR r IN
    SELECT ci.product_id, ci.contado - ci.esperado AS delta
    FROM public.conteo_items ci
    WHERE ci.conteo_id = p_conteo AND ci.contado IS NOT NULL AND ci.contado <> ci.esperado
  LOOP
    INSERT INTO public.inventory_movements (product_id, delta, reason, motivo, note, ref_id, created_by)
    VALUES (r.product_id, r.delta, 'adjustment', p_motivo, 'Conteo: ' || v_c.nombre, p_conteo, v_uid);
    v_n := v_n + 1;
    v_pz := v_pz + r.delta;
  END LOOP;

  UPDATE public.conteos SET estado = 'aplicado', aplicado_at = now(), aplicado_por = v_uid
   WHERE id = p_conteo;

  RETURN QUERY SELECT v_n, v_pz;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.iniciar_conteo(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.contar_item(uuid, uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cerrar_conteo(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.aplicar_conteo(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iniciar_conteo(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contar_item(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_conteo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_conteo(uuid, text) TO authenticated;
