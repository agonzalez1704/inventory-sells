-- Extra product photos (the _FRO/_BOT/_RIT/… views the suppliers ship).
--
-- products.image_url stays the single main photo — every card, row and cart
-- thumbnail keeps reading one column. This table holds ONLY the additional
-- views, so a product with one photo costs zero extra rows and the gallery UI
-- degrades to nothing on its own.
CREATE TABLE IF NOT EXISTS public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url text NOT NULL,
  key text NOT NULL,
  -- Supplier view code (FRO/BOT/RIT/LEF/BAC/OTH). Null for an unnamed extra.
  vista text,
  orden smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, key)
);

CREATE INDEX IF NOT EXISTS product_images_product_idx
  ON public.product_images (product_id, orden);

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

-- Reads for signed-in staff; all writes go through the admin client (bulk
-- loader, future photo form) — same posture as products' image columns.
DO $$ BEGIN
  CREATE POLICY "authenticated read product_images"
    ON public.product_images FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT ON public.product_images TO authenticated;
