-- Whether the register offers "Pieza de fuera" (buying a part next door with
-- drawer cash). A shop habit, not a rule: Fiable's counter does it daily, a
-- refaccionaria never. Off by default; Fiable turns it on in Configuración.
ALTER TABLE public.config_negocio
  ADD COLUMN IF NOT EXISTS pieza_fuera boolean NOT NULL DEFAULT false;
