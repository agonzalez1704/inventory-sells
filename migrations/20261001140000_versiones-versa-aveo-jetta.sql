-- First generations named: Versa, Aveo, Jetta.
--
-- These are the three models the counter asks for most, and the names are the
-- ones a parts man says out loud — "un A4", "el Aveo nuevo" — not catalog
-- codes. Only a year range that fits ENTIRELY inside one generation gets that
-- generation's name; a range that straddles two stays unnamed and reaches both
-- versions through the overlap rule.
--
-- Where two generations were sold side by side (the A4 Clásico kept being built
-- while the A5 Bora was on sale), the narrower generation wins the range: a
-- 2006–2010 part is Bora-shaped, not "anything from 1998 to 2015".
--
-- Nothing here is final: Configuración renames any band in one tap, and only
-- bands nobody has named are touched.

WITH gen(marca, modelo, version, desde, hasta) AS (
  VALUES
    ('Nissan',     'Versa', '1ª generación', 2007, 2012),
    ('Nissan',     'Versa', '2ª generación', 2012, 2019),
    ('Nissan',     'Versa', '3ª generación', 2020, 2025),
    ('Chevrolet',  'Aveo',  '1ª generación', 2004, 2018),
    ('Chevrolet',  'Aveo',  '2ª generación', 2018, 2022),
    ('Chevrolet',  'Aveo',  '3ª generación', 2023, 2025),
    ('Volkswagen', 'Jetta', 'A2',            1987, 1992),
    ('Volkswagen', 'Jetta', 'A3',            1993, 1999),
    ('Volkswagen', 'Jetta', 'A4 Clásico',    1998, 2015),
    ('Volkswagen', 'Jetta', 'A5 Bora',       2006, 2010),
    ('Volkswagen', 'Jetta', 'A6',            2011, 2018),
    ('Volkswagen', 'Jetta', 'A7',            2019, 2025)
)
UPDATE public.tags t
   SET veh_version = elegida.version
  FROM (
    SELECT t2.id,
           (SELECT g.version
              FROM gen g
             WHERE g.marca = t2.veh_marca
               AND g.modelo = t2.veh_modelo
               AND t2.veh_anio_desde >= g.desde
               AND coalesce(t2.veh_anio_hasta, t2.veh_anio_desde) <= g.hasta
             ORDER BY g.hasta - g.desde
             LIMIT 1) AS version
      FROM public.tags t2
     WHERE t2.veh_version IS NULL
       AND t2.veh_anio_desde IS NOT NULL
  ) AS elegida
 WHERE elegida.id = t.id
   AND elegida.version IS NOT NULL;
