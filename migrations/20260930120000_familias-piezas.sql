-- The part family: what the counter actually asks for ("¿traes horquilla?").
--
-- Ruli's category is the ERP's own code — GSAMO, VIPLA, YSHOR — which nobody
-- at the counter can read. The family lives in the name instead: "HORQUILLA
-- INF. IZQ. MUSTANG 11-14". So it is read from the name, through a table of
-- patterns anyone can edit, and kept on the product so a search can filter by
-- it without scanning 21,000 names.
--
-- The patterns carry the shop's own shorthand and its typos: AMORT, HORQ,
-- CREM, and VIELETA for bieleta — 322 rows spell it that way.

CREATE TABLE IF NOT EXISTS public.familias (
  id      text PRIMARY KEY,
  nombre  text NOT NULL,
  -- Matched against the NORMALIZED name (upper case, no accents). First match
  -- by `orden` wins, so the specific ones go first.
  patron  text NOT NULL,
  orden   int NOT NULL DEFAULT 100
);

ALTER TABLE public.familias ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "authenticated read familias" ON public.familias
    FOR SELECT TO authenticated USING (public.requesting_user_id() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT ON public.familias TO authenticated;

INSERT INTO public.familias (id, nombre, patron, orden) VALUES
  ('cubre_polvo',   'Cubre polvo',          '^(CUBREPOLVO|CUBRE ?POLVO|CUBRE)',            10),
  ('base_amort',    'Base de amortiguador', '^(BASE|BACE)',                                15),
  ('amortiguador',  'Amortiguador',         '^(AMORTIGUADOR|AMORTIGUADORES|AMORT)',        20),
  ('horquilla',     'Horquilla',            '^(HORQUILLA|HORQUILLAS|HORQ)',                20),
  ('cremallera',    'Cremallera',           '^(CREMALLERA|CREM)',                          20),
  ('bieleta',       'Bieleta',              '^(BIELETA|VIELETA|BIELETAS)',                 20),
  ('terminal',      'Terminal',             '^(TERMINAL|TERMINALES)',                      20),
  ('rotula',        'Rótula',               '^(ROTULA|ROTULAS)',                           20),
  ('buje',          'Buje',                 '^(BUJE|BUJES)',                               20),
  ('maza',          'Maza de rueda',        '^(MAZA|MAZAS)',                               20),
  ('balero',        'Balero',               '^(BALERO|BALEROS|RODAMIENTO)',                20),
  ('resorte',       'Resorte',              '^(RESORTE|RESORTES|MUELLE)',                  20),
  ('soporte',       'Soporte',              '^(SOPORTE|SOPORTES|SOP )',                    25),
  ('flecha',        'Flecha',               '^(FLECHA|FLECHAS|TRIPODE)',                   25),
  ('junta',         'Junta',                '^(JUNTA|JUNTAS)',                             25),
  ('goma_estab',    'Goma estabilizadora',  '^(GOMA|GOMAS)',                               25),
  ('espiga',        'Espiga',               '^(ESPIGA|ESPIGAS)',                           25),
  ('barra',         'Barra',                '^(BARRA|BARRAS)',                             25),
  ('brazo',         'Brazo',                '^(BRAZO|BRAZOS)',                             25),
  ('varilla',       'Varilla',              '^(VARILLA|VARILLAS)',                         25),
  ('balata',        'Balatas',              '^(BALATA|BALATAS|PASTILLA)',                  30),
  ('disco',         'Disco de freno',       '^(DISCO|DISCOS|ROTOR)',                       30),
  ('bomba',         'Bomba',                '^(BOMBA|BOMBAS)',                             30),
  ('filtro',        'Filtro',               '^(FILTRO|FILTROS)',                           30),
  ('radiador',      'Radiador',             '^(RADIADOR|RADIADORES)',                      30),
  ('banda',         'Banda',                '^(BANDA|BANDAS)',                             30),
  ('bujia',         'Bujía',                '^(BUJIA|BUJIAS)',                             30),
  ('reten',         'Retén',                '^(RETEN|RETENES)',                            30),
  ('tornillo',      'Tornillería',          '^(TORNILLO|TORNILLOS|BIRLO|TUERCA)',          35),
  ('manguera',      'Manguera',             '^(MANGUERA|MANGUERAS)',                       35),
  ('aceite',        'Aceite y líquidos',    '^(ACEITE|LIQUIDO|ANTICONGELANTE)',            35),
  ('kit',           'Kit / repuesto',       '^(REP |REPUESTO|JGO|JUEGO|KIT)',              40)
ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, patron = EXCLUDED.patron, orden = EXCLUDED.orden;

/** Upper case, accents folded, single spaces — what the patterns match against. */
CREATE OR REPLACE FUNCTION public.normalizar_pieza(p_texto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(regexp_replace(
    upper(translate(coalesce(p_texto, ''),
      'áàäâãéèëêíìïîóòöôõúùüûñÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑ',
      'AAAAAEEEEIIIIOOOOOUUUUNAAAAAEEEEIIIIOOOOOUUUUN')),
    '[^A-Z0-9]+', ' ', 'g'));
$$;

/** The family a part name belongs to, or null when no pattern claims it. */
CREATE OR REPLACE FUNCTION public.familia_de(p_nombre text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT f.id
    FROM public.familias f
   WHERE public.normalizar_pieza(p_nombre) ~ f.patron
   ORDER BY f.orden, length(f.patron) DESC
   LIMIT 1;
$$;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS familia text REFERENCES public.familias(id);
CREATE INDEX IF NOT EXISTS products_familia_idx ON public.products (familia) WHERE familia IS NOT NULL;

-- Kept in step with the name: a product renamed or imported lands in the right
-- family without anyone re-running a script.
CREATE OR REPLACE FUNCTION public.set_familia()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.name IS DISTINCT FROM OLD.name THEN
    NEW.familia := public.familia_de(NEW.name);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_familia ON public.products;
CREATE TRIGGER products_familia
  BEFORE INSERT OR UPDATE OF name ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_familia();

-- Backfill what is already there.
UPDATE public.products SET familia = public.familia_de(name) WHERE familia IS NULL;
