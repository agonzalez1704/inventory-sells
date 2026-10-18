-- "Lo que sabe el agente": what the shop teaches the WhatsApp agent.
--
-- Three kinds, one table:
--   juego    a set of parts sold together ("suspensión completa"): nombre is
--            the set, piezas says what goes in it and how to find each part
--   sinonimo another name for a part ("pastillas" = balata): frases are the
--            customer's words, nombre what the catalog calls it
--   nota     a shop rule the agent keeps in mind: nombre titles it, texto says it
--
-- Nothing is trained: the agent reads these on every message. The server is
-- the only reader and writer (admin client), so no policies are granted.

CREATE TABLE IF NOT EXISTS public.agente_saberes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         text NOT NULL CHECK (tipo IN ('juego', 'sinonimo', 'nota')),
  nombre       text NOT NULL CHECK (btrim(nombre) <> ''),
  -- How customers say it, lower-case as typed. Matched accent-insensitively.
  frases       text[] NOT NULL DEFAULT '{}',
  -- [{nombre, busca, cantidad, por_lado, obligatoria}]. `busca` is the text
  -- matched against catalog names ("amortiguador del"), because the catalog
  -- abbreviates what the customer spells out.
  piezas       jsonb NOT NULL DEFAULT '[]'::jsonb,
  texto        text,
  activo       boolean NOT NULL DEFAULT true,
  -- The WhatsApp conversation it was taught from, if any.
  origen_clave text,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agente_saberes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS agente_saberes_activo_idx ON public.agente_saberes (activo, tipo);

-- Starting knowledge, once, per shop. A database with vehicle tags is the auto
-- parts shop; the other one sells phone parts.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.agente_saberes) THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.tags WHERE veh_marca IS NOT NULL) THEN
    INSERT INTO public.agente_saberes (tipo, nombre, frases, created_by) VALUES
      ('sinonimo', 'balata', ARRAY['pastillas', 'pastilla'], 'sistema'),
      ('sinonimo', 'horquilla', ARRAY['tijera', 'tijeras'], 'sistema'),
      ('sinonimo', 'vieleta', ARRAY['huesitos', 'huesito', 'bieleta', 'bieletas'], 'sistema'),
      ('sinonimo', 'soporte motor', ARRAY['cebolla', 'cebollas'], 'sistema');
    INSERT INTO public.agente_saberes (tipo, nombre, frases, piezas, created_by) VALUES
      ('juego', 'Suspensión completa',
       ARRAY['suspension completa', 'la suspension', 'kit de suspension', 'todo lo de la suspension'],
       '[
         {"nombre": "Amortiguador delantero", "busca": "amortiguador del", "cantidad": 2, "por_lado": false, "obligatoria": true},
         {"nombre": "Amortiguador trasero", "busca": "amortiguador tras", "cantidad": 2, "por_lado": false, "obligatoria": true},
         {"nombre": "Base de amortiguador trasera", "busca": "base amortiguador tras", "cantidad": 2, "por_lado": false, "obligatoria": true},
         {"nombre": "Horquilla inferior", "busca": "horquilla inf", "cantidad": 1, "por_lado": true, "obligatoria": true},
         {"nombre": "Rótula inferior", "busca": "rotula inf", "cantidad": 1, "por_lado": true, "obligatoria": true},
         {"nombre": "Vieleta", "busca": "vieleta", "cantidad": 2, "por_lado": false, "obligatoria": false}
       ]'::jsonb,
       'sistema');
  ELSE
    INSERT INTO public.agente_saberes (tipo, nombre, frases, created_by) VALUES
      ('sinonimo', 'glass', ARRAY['cristal', 'vidrio'], 'sistema'),
      ('sinonimo', 'bateria', ARRAY['pila'], 'sistema'),
      ('sinonimo', 'tapa trasera', ARRAY['tapa de atras', 'tapa de atrás'], 'sistema');
  END IF;
END $$;
