-- "Gestionar inventario" was doing two jobs: editing the catalog AND running
-- the whole supply chain (compras, proveedores, requisiciones). A seller who
-- must create products therefore saw every purchasing screen. The code now
-- gates supply on its own permiso, `abastecer`; this grants it to the roles
-- that already ran supply through inventario_gestionar, so nobody loses a
-- screen they use today. (/surtido moved to the existing `surtir` permiso —
-- no grant needed, the fulfillment roles already carry it.)
--
-- Idempotent on purpose: role_permissions has PK (role_id, permiso).
INSERT INTO public.role_permissions (role_id, permiso)
SELECT r.id, 'abastecer'
FROM public.roles r
WHERE r.slug IN ('dueno', 'encargado', 'jefe_almacen')
ON CONFLICT DO NOTHING;
