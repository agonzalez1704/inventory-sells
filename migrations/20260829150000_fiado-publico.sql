-- Per-note visibility for credit notes. A seller normally sees only the notes
-- they created (/fiados scoping); marking one PUBLIC puts it on every seller's
-- screen so whoever the customer walks up to can collect it. The admin decides
-- per note — visibility is a property of the debt, not of the viewer.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS fiado_publico boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sales.fiado_publico IS
  'Nota de crédito visible para todos los vendedores (cualquiera puede cobrarla). Solo relevante en status=pending.';
