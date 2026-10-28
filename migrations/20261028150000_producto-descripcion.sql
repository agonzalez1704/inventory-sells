-- Catálogo: the owner writes a longer description per part (the name stays
-- the SAE's short one). Shown in the store's product page and the POS sheet.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS descripcion text;
