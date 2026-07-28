-- Flexible roles & permissions.
--
-- profiles.role was a fixed text enum ('admin' | 'seller'). This makes roles
-- DATA: a `roles` table plus a `role_permissions` map, so an admin can create a
-- new role and grant it whatever permissions they like. Permission KEYS are
-- still code-defined (each corresponds to a capability the app checks) — the
-- admin composes roles out of them, they can't invent a key the code ignores.
--
-- Transition is additive and back-compat: profiles.role stays in sync for the
-- built-in roles so existing `role = 'admin'` checks keep working, and is_admin()
-- is redefined to read a permission ('admin_total') so it also honors any custom
-- role granted full control.

CREATE TABLE IF NOT EXISTS public.roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  is_system   boolean NOT NULL DEFAULT false,  -- built-ins can't be deleted
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permiso text NOT NULL,
  PRIMARY KEY (role_id, permiso)
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.roles(id);
CREATE INDEX IF NOT EXISTS profiles_role_id_idx ON public.profiles (role_id);

-- ---- Seed the four built-in roles ----
INSERT INTO public.roles (slug, name, description, is_system) VALUES
  ('dueno',     'Dueño',     'Control total del sistema.',                         true),
  ('encargado', 'Encargado', 'Opera todo menos costos, precios base y usuarios.',  true),
  ('vendedor',  'Vendedor',  'Cotiza, vende y cobra; solo ve lo suyo.',            true),
  ('surtidor',  'Surtidor',  'Prepara y surte pedidos.',                           true)
ON CONFLICT (slug) DO NOTHING;

-- ---- Seed each role's permissions ----
WITH perms(slug, permiso) AS (VALUES
  -- Dueño: todo, incl. admin_total (lo que hace verdadero is_admin()).
  ('dueno','admin_total'), ('dueno','pos_vender'), ('dueno','cotizar'),
  ('dueno','cotizaciones_ver_todas'), ('dueno','cotizaciones_reasignar'), ('dueno','autorizar'),
  ('dueno','surtir'), ('dueno','inventario_ver'), ('dueno','inventario_gestionar'),
  ('dueno','precios_gestionar'), ('dueno','costos_ver'), ('dueno','corte_ver'),
  ('dueno','facturar'), ('dueno','devoluciones'), ('dueno','usuarios_gestionar'),
  -- Encargado: opera todo, sin costos/corte/precios/usuarios.
  ('encargado','pos_vender'), ('encargado','cotizar'), ('encargado','cotizaciones_ver_todas'),
  ('encargado','cotizaciones_reasignar'), ('encargado','autorizar'), ('encargado','surtir'),
  ('encargado','inventario_ver'), ('encargado','inventario_gestionar'),
  ('encargado','facturar'), ('encargado','devoluciones'),
  -- Vendedor: solo lo suyo.
  ('vendedor','pos_vender'), ('vendedor','cotizar'), ('vendedor','autorizar'),
  ('vendedor','surtir'), ('vendedor','inventario_ver'),
  -- Surtidor: surtido nada más.
  ('surtidor','surtir'), ('surtidor','inventario_ver')
)
INSERT INTO public.role_permissions (role_id, permiso)
SELECT r.id, perms.permiso
FROM perms JOIN public.roles r ON r.slug = perms.slug
ON CONFLICT DO NOTHING;

-- ---- Backfill existing users onto the new roles ----
UPDATE public.profiles
   SET role_id = (SELECT id FROM public.roles WHERE slug = 'dueno')
 WHERE role = 'admin' AND role_id IS NULL;
UPDATE public.profiles
   SET role_id = (SELECT id FROM public.roles WHERE slug = 'vendedor')
 WHERE role <> 'admin' AND role_id IS NULL;

-- ---- is_admin() now reads a permission, so custom "full control" roles count ----
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles pr
    JOIN public.role_permissions rp ON rp.role_id = pr.role_id
    WHERE pr.id = public.requesting_user_id() AND rp.permiso = 'admin_total'
  );
$$;

-- Does the requesting user hold a given permission? (for RLS / RPC guards)
CREATE OR REPLACE FUNCTION public.has_permiso(p_permiso text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles pr
    JOIN public.role_permissions rp ON rp.role_id = pr.role_id
    WHERE pr.id = public.requesting_user_id() AND rp.permiso = p_permiso
  );
$$;

-- roles/role_permissions are managed only through the admin client (server
-- actions), never from the browser.
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
