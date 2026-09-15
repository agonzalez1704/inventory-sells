-- products.modelo: strip EVERY trailing quality/frame token, not just the last.
--
-- The expression was anchored to the end and removed one token, so
-- "A31 OLED C/M" lost "C/M" and kept "OLED": the model "A31 OLED" never grouped
-- with "A31 INCELL" and "A31 ORG". The redesigned catalog lists one row per
-- model and the model page offers its qualities, so the Samsung A31 showed as
-- three models, each with one quality. Repeating the group fixes it:
-- Fiable 595 → 571 models, Ruli unchanged (18,304 — its names carry no tokens).
-- S/M (sin marco) joins the list; it is as much a variant as C/M.
--
-- PostgreSQL 15 cannot change a generated expression in place, so the column is
-- dropped and added back in this one transaction. Nothing else is stored off
-- it: the storefront functions read it through EXECUTE, and its only index is
-- recreated below.

DROP INDEX IF EXISTS public.products_modelo_idx;
ALTER TABLE public.products DROP COLUMN IF EXISTS modelo;
ALTER TABLE public.products
  ADD COLUMN modelo text
  GENERATED ALWAYS AS (
    btrim(regexp_replace(
      upper(name),
      '(\s*(HD\s+)?(INCELL|OLED|ORG|ORIGINAL|AAA|GX\s+AMOLED|AMOLED|JK|C/M|S/M|W/F|FULL\s+HD|HD))+\s*$',
      '', 'g'))
  ) STORED;

CREATE INDEX IF NOT EXISTS products_modelo_idx
  ON public.products (brand, category, modelo) WHERE is_active;
