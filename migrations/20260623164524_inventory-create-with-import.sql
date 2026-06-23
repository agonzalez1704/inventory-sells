-- Allow manual single-item adds, and create-inventory-with-import atomically.

ALTER TABLE public.import_batches DROP CONSTRAINT IF EXISTS import_batches_source_check;
ALTER TABLE public.import_batches
  ADD CONSTRAINT import_batches_source_check
  CHECK (source IN ('image', 'excel', 'csv', 'pdf', 'manual'));

-- Create an inventory and import rows into it in one transaction. If the import
-- raises (bad rows, etc.), the inventory insert rolls back too — so the
-- inventory only exists when its import succeeds.
CREATE OR REPLACE FUNCTION public.create_inventory_and_import(
  p_name     text,
  p_rows     jsonb,
  p_source   text,
  p_filename text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid    text := public.requesting_user_id();
  v_inv_id uuid;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only' USING errcode = '42501';
  END IF;
  IF COALESCE(TRIM(p_name), '') = '' THEN
    RAISE EXCEPTION 'name required';
  END IF;

  INSERT INTO public.inventories (name, created_by)
  VALUES (TRIM(p_name), v_uid)
  RETURNING id INTO v_inv_id;

  -- Same transaction: a failure here rolls back the inventory insert above.
  v_result := public.commit_import(p_rows, p_source, p_filename, v_inv_id);

  RETURN jsonb_build_object('inventory_id', v_inv_id, 'name', TRIM(p_name))
         || COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_inventory_and_import(text, jsonb, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_inventory_and_import(text, jsonb, text, text) TO authenticated;
