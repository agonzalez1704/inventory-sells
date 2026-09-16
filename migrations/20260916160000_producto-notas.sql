-- /inventario redesign, part 2: internal notes per product (the panel's
-- "Notas" tab). Team knowledge about a piece — "el lote de septiembre trae el
-- marco más delgado" — that has nowhere to live today.
--
-- Writes go through server actions on the admin client (author checked
-- there); staff read them directly.
CREATE TABLE IF NOT EXISTS public.product_notas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  texto       text NOT NULL CHECK (length(btrim(texto)) BETWEEN 1 AND 2000),
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_notas_producto_idx
  ON public.product_notas (product_id, created_at DESC);

ALTER TABLE public.product_notas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "authenticated read product_notas" ON public.product_notas
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT ON public.product_notas TO authenticated;
