-- Product photos for the public storefront. image_url is a customer-safe field
-- (public-read); image_key is the Storage object key, kept for re-upload/delete.
-- Images live in the public `product-images` bucket; rows are seeded by the
-- admin image-import pipeline. Nullable — most products start without a photo.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_key text;
