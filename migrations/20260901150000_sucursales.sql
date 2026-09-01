-- Branches (sucursales) with a geo check-in at the start of the workday.
--
-- The admin defines each branch's location (lat/lng + radius) and which
-- branches each employee may work from. When an assigned employee opens the
-- app, it asks for their location and records WHERE they actually are; being
-- inside an allowed branch's radius is what lets them through. The check-in
-- table is the audit: quién, cuándo, en qué sucursal, y a qué distancia.
--
-- Sales are deliberately NOT restricted by branch inventory — the shop decided
-- any seller may sell from any inventory.
CREATE TABLE IF NOT EXISTS public.sucursales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  -- Generous by default: browser geolocation on desktops can be IP-coarse.
  radio_m integer NOT NULL DEFAULT 300 CHECK (radio_m BETWEEN 20 AND 5000),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sucursales_nombre_key
  ON public.sucursales (lower(btrim(nombre)));

CREATE TABLE IF NOT EXISTS public.profile_sucursales (
  profile_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sucursal_id uuid NOT NULL REFERENCES public.sucursales(id) ON DELETE CASCADE,
  PRIMARY KEY (profile_id, sucursal_id)
);

CREATE TABLE IF NOT EXISTS public.checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sucursal_id uuid NOT NULL REFERENCES public.sucursales(id),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  distancia_m integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS checkins_profile_dia_idx
  ON public.checkins (profile_id, created_at DESC);

ALTER TABLE public.sucursales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_sucursales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "authenticated read sucursales" ON public.sucursales
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "authenticated read profile_sucursales" ON public.profile_sucursales
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "authenticated read checkins" ON public.checkins
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT ON public.sucursales, public.profile_sucursales, public.checkins TO authenticated;
