-- Annual sales as a real column, and a role that can see it.
--
-- The figure already arrives from the ERP import and lands in
-- products.attributes->>'ventas_anuales' (11,735 of Ruli's 21,015 products
-- carry one). Reading it from JSON is fine for one row and useless for a
-- table: the inventory list sorts in SQL, and you cannot index or ORDER BY a
-- JSON path the way you can a column.
--
-- Guarded rather than a bare cast. attributes is free-form — one non-numeric
-- value in that key would make every INSERT on the table fail, and the import
-- writes thousands at a time. A row with junk in there simply has no figure.
ALTER TABLE public.products
  ADD COLUMN ventas_anuales integer GENERATED ALWAYS AS (
    CASE
      WHEN attributes ->> 'ventas_anuales' ~ '^[0-9]+$'
      THEN (attributes ->> 'ventas_anuales')::integer
    END
  ) STORED;

-- Sorted descending is the only way anyone reads this: what moves most.
CREATE INDEX products_ventas_anuales_idx
  ON public.products (ventas_anuales DESC NULLS LAST)
  WHERE is_active;

-- ---- The new role ----
--
-- is_system, like the other four: shipped by the app, so an admin can edit its
-- permissions but cannot delete a role that users may be sitting on.
INSERT INTO public.roles (slug, name, description, is_system) VALUES
  ('jefe_almacen', 'Jefe de almacén',
   'Surte y gestiona el inventario; ve la rotación anual. Sin costos ni precios.',
   true)
ON CONFLICT (slug) DO NOTHING;

-- ---- Permissions ----
--
-- ventas_ver is its own key rather than riding on inventario_ver: how much a
-- product sells in a year is a commercial figure, and plenty of people who
-- need to look up stock have no business reading it. Granting it to another
-- role is a click in the role editor — the point of this being a permission
-- and not a hard-coded check on the role name.
WITH perms(slug, permiso) AS (VALUES
  ('jefe_almacen','surtir'),
  ('jefe_almacen','inventario_ver'),
  ('jefe_almacen','inventario_gestionar'),
  ('jefe_almacen','ventas_ver'),
  -- Dueño already passes every check through admin_total; the row is here so
  -- the seed keeps listing its permissions explicitly, as it always has.
  ('dueno','ventas_ver')
)
INSERT INTO public.role_permissions (role_id, permiso)
SELECT r.id, perms.permiso
FROM perms JOIN public.roles r ON r.slug = perms.slug
ON CONFLICT DO NOTHING;
