-- What each user sees on the register, stored per user.
--
-- Not per business: two people at the same counter want different things on
-- screen. The owner checking margin wants the cost; the seller ringing up a
-- customer wants the price they are about to charge, and showing them the cost
-- would put it in front of whoever is standing across the counter.
--
-- Same shape as notification_prefs: user_id defaulted from the JWT and RLS that
-- only ever lets a row see itself, so one user cannot read or set another's.
CREATE TABLE public.pos_prefs (
  user_id     text PRIMARY KEY DEFAULT public.requesting_user_id(),
  -- Which figure the product card shows. 'venta' is the safe default: a new
  -- user has to opt in to seeing cost, rather than opt out.
  precio_base text NOT NULL DEFAULT 'venta' CHECK (precio_base IN ('venta', 'costo')),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pos_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own read pos_prefs"
  ON public.pos_prefs FOR SELECT TO authenticated
  USING (user_id = public.requesting_user_id());
CREATE POLICY "own insert pos_prefs"
  ON public.pos_prefs FOR INSERT TO authenticated
  WITH CHECK (user_id = public.requesting_user_id());
CREATE POLICY "own update pos_prefs"
  ON public.pos_prefs FOR UPDATE TO authenticated
  USING (user_id = public.requesting_user_id())
  WITH CHECK (user_id = public.requesting_user_id());

GRANT SELECT, INSERT, UPDATE ON public.pos_prefs TO authenticated;

-- RLS is not the authorisation here, only the isolation: it stops one user
-- reading another's row, but nothing in it says who may choose 'costo'. That
-- is costos_ver, checked in the action that writes.

-- Jefe de almacén needs the cost on the register, which is what this feature is
-- for. The role shipped without costos_ver two migrations ago because the
-- question had not been answered yet.
INSERT INTO public.role_permissions (role_id, permiso)
SELECT r.id, 'costos_ver' FROM public.roles r WHERE r.slug = 'jefe_almacen'
ON CONFLICT DO NOTHING;
