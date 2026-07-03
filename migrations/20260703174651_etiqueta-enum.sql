-- Constrain products.etiqueta to a fixed set (enum). Mirrors ETIQUETAS in
-- lib/etiquetas.ts. To add a tag: DROP this constraint and re-add it with the
-- new value list, and update lib/etiquetas.ts.
ALTER TABLE public.products
  ADD CONSTRAINT products_etiqueta_check
  CHECK (etiqueta IS NULL OR etiqueta IN ('Almacén disputa'));
