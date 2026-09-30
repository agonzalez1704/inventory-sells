-- Two levels, the way the counter thinks: first the system, then the part.
--
-- "Primero dame por la suspensión, y entre la suspensión las horquillas, los
-- amortiguadores; y luego motor, y ahí las bujías" — one row of chips for the
-- system, a second for its families.
--
-- Some families genuinely straddle two systems, because the family comes from
-- the first word of the name: a BOMBA is a water pump or a brake master, a
-- JUNTA is a head gasket or a CV joint, a SOPORTE is a motor mount or a
-- suspension mount. Each one is filed where it lands most often, and the table
-- is editable — moving a family is an UPDATE, not a deploy.

CREATE TABLE IF NOT EXISTS public.sistemas (
  id     text PRIMARY KEY,
  nombre text NOT NULL,
  orden  int NOT NULL DEFAULT 100
);

ALTER TABLE public.sistemas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "authenticated read sistemas" ON public.sistemas
    FOR SELECT TO authenticated USING (public.requesting_user_id() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT ON public.sistemas TO authenticated;

INSERT INTO public.sistemas (id, nombre, orden) VALUES
  ('suspension',  'Suspensión',   10),
  ('direccion',   'Dirección',    20),
  ('frenos',      'Frenos',       30),
  ('transmision', 'Transmisión',  40),
  ('motor',       'Motor',        50),
  ('otros',       'Otros',        90)
ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, orden = EXCLUDED.orden;

ALTER TABLE public.familias ADD COLUMN IF NOT EXISTS sistema text REFERENCES public.sistemas(id);

UPDATE public.familias SET sistema = v.sistema FROM (VALUES
  ('amortiguador', 'suspension'),
  ('base_amort',   'suspension'),
  ('resorte',      'suspension'),
  ('horquilla',    'suspension'),
  ('rotula',       'suspension'),
  ('bieleta',      'suspension'),
  ('buje',         'suspension'),
  ('goma_estab',   'suspension'),
  ('maza',         'suspension'),
  ('balero',       'suspension'),
  ('barra',        'suspension'),
  ('brazo',        'suspension'),
  ('espiga',       'suspension'),
  ('varilla',      'suspension'),
  ('cremallera',   'direccion'),
  ('terminal',     'direccion'),
  ('balata',       'frenos'),
  ('disco',        'frenos'),
  ('flecha',       'transmision'),
  ('cubre_polvo',  'transmision'),
  ('junta',        'transmision'),
  ('soporte',      'motor'),
  ('bujia',        'motor'),
  ('banda',        'motor'),
  ('filtro',       'motor'),
  ('bomba',        'motor'),
  ('radiador',     'motor'),
  ('reten',        'motor'),
  ('aceite',       'motor'),
  ('manguera',     'motor'),
  ('tornillo',     'otros'),
  ('kit',          'otros')
) AS v(id, sistema)
WHERE public.familias.id = v.id;

UPDATE public.familias SET sistema = 'otros' WHERE sistema IS NULL;

-- New columns in the result: drop first, or a call naming the old parameters
-- would match two functions.
DROP FUNCTION IF EXISTS public.piezas_por_vehiculo(text, text, int, text, boolean, int);

CREATE OR REPLACE FUNCTION public.piezas_por_vehiculo(
  p_marca      text,
  p_modelo     text DEFAULT NULL,
  p_anio       int  DEFAULT NULL,
  p_familia    text DEFAULT NULL,
  p_solo_stock boolean DEFAULT false,
  p_limit      int  DEFAULT 300,
  p_sistema    text DEFAULT NULL
)
RETURNS TABLE (
  id             uuid,
  inventory_id   uuid,
  sku            text,
  name           text,
  image_url      text,
  price_cents    int,
  cost_cents     int,
  quantity       int,
  familia        text,
  familia_nombre text,
  sistema        text,
  sistema_nombre text,
  compat         text,
  anio_desde     int,
  anio_hasta     int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH coincide AS (
    SELECT DISTINCT ON (p.id)
      p.id, p.inventory_id, p.sku, p.name, p.image_url, p.price_cents, p.cost_cents,
      p.quantity, p.familia,
      t.veh_modelo, t.veh_anio_desde, t.veh_anio_hasta
    FROM public.products p
    JOIN public.product_tags pt ON pt.product_id = p.id
    JOIN public.tags t ON t.id = pt.tag_id
    LEFT JOIN public.familias fx ON fx.id = p.familia
   WHERE p.is_active
     AND t.veh_marca = p_marca
     AND (p_modelo IS NULL OR t.veh_modelo = p_modelo)
     AND (
       p_anio IS NULL
       OR t.veh_anio_desde IS NULL
       OR p_anio BETWEEN t.veh_anio_desde AND coalesce(t.veh_anio_hasta, t.veh_anio_desde)
     )
     AND (p_familia IS NULL OR p.familia = p_familia)
     AND (p_sistema IS NULL OR fx.sistema = p_sistema)
     AND (NOT p_solo_stock OR p.quantity > 0)
   ORDER BY p.id, t.veh_anio_desde DESC NULLS LAST
  )
  SELECT c.id, c.inventory_id, c.sku, c.name, c.image_url, c.price_cents, c.cost_cents,
         c.quantity, c.familia, f.nombre, f.sistema, s.nombre,
         CASE
           WHEN c.veh_anio_desde IS NULL THEN c.veh_modelo
           WHEN c.veh_anio_hasta IS NULL OR c.veh_anio_hasta = c.veh_anio_desde
             THEN c.veh_modelo || ' ' || c.veh_anio_desde
           ELSE c.veh_modelo || ' ' || c.veh_anio_desde || '–' || c.veh_anio_hasta
         END,
         c.veh_anio_desde, c.veh_anio_hasta
    FROM coincide c
    LEFT JOIN public.familias f ON f.id = c.familia
    LEFT JOIN public.sistemas s ON s.id = f.sistema
   ORDER BY (c.quantity > 0) DESC, s.orden NULLS LAST, f.orden NULLS LAST, c.name
   LIMIT greatest(1, least(p_limit, 500));
$$;

REVOKE ALL ON FUNCTION public.piezas_por_vehiculo(text, text, int, text, boolean, int, text) FROM public;
GRANT EXECUTE ON FUNCTION public.piezas_por_vehiculo(text, text, int, text, boolean, int, text) TO authenticated;
