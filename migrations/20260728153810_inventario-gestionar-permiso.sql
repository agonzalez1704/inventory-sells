-- Wire inventory WRITES to the permission model: a role with inventario_gestionar
-- (not only admin_total) may manage the catalog. Backward-compatible — is_admin()
-- (any role carrying admin_total, e.g. dueño) still passes, so current behavior is
-- unchanged. Relaxes the gate in the write RPCs and the products/inventories
-- policies. Photo upload (set_product_image) stays open to all staff as before.

-- RPCs: swap the gate in-place from the LIVE definition so there is no
-- hand-transcription of the (long) bodies — only the gate predicate changes.
DO $$
DECLARE d text;
BEGIN
  FOR d IN
    SELECT pg_get_functiondef(p.oid)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('adjust_stock', 'commit_import', 'create_inventory_and_import')
  LOOP
    EXECUTE replace(
      d,
      'NOT public.is_admin()',
      'NOT (public.is_admin() OR public.has_permiso(''inventario_gestionar''))'
    );
  END LOOP;
END $$;

-- Policies.
DROP POLICY IF EXISTS "admin update products" ON public.products;
CREATE POLICY "manage products" ON public.products FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.has_permiso('inventario_gestionar'))
  WITH CHECK (public.is_admin() OR public.has_permiso('inventario_gestionar'));

DROP POLICY IF EXISTS "admin insert inventories" ON public.inventories;
CREATE POLICY "manage insert inventories" ON public.inventories FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.has_permiso('inventario_gestionar'));

DROP POLICY IF EXISTS "admin update inventories" ON public.inventories;
CREATE POLICY "manage update inventories" ON public.inventories FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.has_permiso('inventario_gestionar'))
  WITH CHECK (public.is_admin() OR public.has_permiso('inventario_gestionar'));
