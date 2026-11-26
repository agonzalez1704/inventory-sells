-- A count is of the whole store, not of one shelf: the person types "samsung
-- a06", every screen of that model comes up with the inventory it lives in,
-- and they write what they found. inventory_id stays for a count scoped to
-- one inventory; NULL means every physical inventory.
--
-- Counting also learns to take a product that was not in the opening snapshot
-- (created after the count opened): it is inserted on the spot.

ALTER TABLE public.conteos ALTER COLUMN inventory_id DROP NOT NULL;
-- One open store-wide count at a time, same reason as the per-inventory rule.
CREATE UNIQUE INDEX IF NOT EXISTS conteos_abierto_global
  ON public.conteos ((true)) WHERE estado = 'abierto' AND inventory_id IS NULL;

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
  IF EXISTS (SELECT 1 FROM public.conteos WHERE estado = 'abierto'
             AND (inventory_id = p_inventory OR (inventory_id IS NULL AND p_inventory IS NULL))) THEN
    RAISE EXCEPTION 'ya hay un conteo abierto para ese alcance';
  END IF;

  INSERT INTO public.conteos (inventory_id, nombre, motivo, created_by)
  VALUES (p_inventory, btrim(p_nombre), NULLIF(btrim(coalesce(p_motivo, '')), ''), v_uid)
  RETURNING id INTO v_id;

  INSERT INTO public.conteo_items (conteo_id, product_id, esperado, cost_cents, price_cents)
  SELECT v_id, p.id, p.quantity, p.cost_cents, p.price_cents
  FROM public.products p
  JOIN public.inventories i ON i.id = p.inventory_id
  WHERE p.is_active
    AND NOT coalesce(i.es_dropship, false) AND NOT coalesce(i.solo_consulta, false)
    AND (p_inventory IS NULL OR p.inventory_id = p_inventory);

  RETURN v_id;
END;
$$;

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
  v_c   public.conteos%ROWTYPE;
  v_p   public.products%ROWTYPE;
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
  SELECT * INTO v_c FROM public.conteos WHERE id = p_conteo;
  IF NOT FOUND OR v_c.estado <> 'abierto' THEN
    RAISE EXCEPTION 'el conteo ya está cerrado';
  END IF;

  SELECT * INTO v_p FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'producto no encontrado';
  END IF;
  IF v_c.inventory_id IS NOT NULL AND v_p.inventory_id <> v_c.inventory_id THEN
    RAISE EXCEPTION 'ese producto no está en el inventario de este conteo';
  END IF;

  INSERT INTO public.conteo_items (conteo_id, product_id, esperado, contado, cost_cents, price_cents, contado_por, contado_at)
  VALUES (p_conteo, p_product_id, v_p.quantity, p_contado, v_p.cost_cents, v_p.price_cents,
          CASE WHEN p_contado IS NULL THEN NULL ELSE v_uid END,
          CASE WHEN p_contado IS NULL THEN NULL ELSE now() END)
  ON CONFLICT (conteo_id, product_id) DO UPDATE
    SET esperado = EXCLUDED.esperado,
        contado = EXCLUDED.contado,
        contado_por = EXCLUDED.contado_por,
        contado_at = EXCLUDED.contado_at;

  RETURN QUERY SELECT v_p.quantity, p_contado;
END;
$$;
