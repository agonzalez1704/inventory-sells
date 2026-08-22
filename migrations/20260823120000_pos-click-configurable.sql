-- Whether a plain click on a POS card adds to the sale or opens the detail
-- sheet. An admin decides for the whole shop, from Configuración — the same
-- home as fiado_exige_cliente, because it is the same kind of fact: how THIS
-- counter works, not how the code works.
--
-- Default false = today's behavior (click adds) everywhere. Ruli is flipped as
-- data: 21k opaque part codes mean verifying the part IS their workflow.
ALTER TABLE public.config_negocio
  ADD COLUMN IF NOT EXISTS pos_click_abre_detalle boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.config_negocio.pos_click_abre_detalle IS
  'true: un clic en el POS abre la descripción del producto; agregar vive en el botón del detalle. false: un clic agrega directo.';
