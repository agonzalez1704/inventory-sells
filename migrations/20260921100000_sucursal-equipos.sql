-- Counter computers vouch for their branch.
--
-- A desktop has no GPS: the browser locates it by Wi-Fi or IP, and the Mac at
-- Panorama's counter read 654 m away from the branch its employee was
-- standing in. A computer bolted to a counter never moves, so it is paired
-- with its branch once and checks the employee in from there.
--
-- Pairing is a short code an admin creates (valid 15 minutes) and the
-- employee types once on that computer, which then keeps a device token. The
-- code is what keeps a seller from pairing their own laptop at home: only an
-- admin can mint one.

CREATE TABLE IF NOT EXISTS public.sucursal_equipos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal_id   uuid NOT NULL REFERENCES public.sucursales(id) ON DELETE CASCADE,
  codigo        text UNIQUE,
  codigo_expira timestamptz,
  token         text UNIQUE,
  activado_at   timestamptz,
  activado_por  text,
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Server actions reach it with the admin client only; no one reads it directly.
ALTER TABLE public.sucursal_equipos ENABLE ROW LEVEL SECURITY;

-- How the day was started: by the phone's location, or by a paired computer.
ALTER TABLE public.checkins
  ADD COLUMN IF NOT EXISTS metodo text NOT NULL DEFAULT 'gps'
    CHECK (metodo IN ('gps', 'equipo'));
