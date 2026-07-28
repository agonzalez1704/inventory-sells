-- Public share link for a quote.
--
-- A customer can open a quote and authorize it themselves via an unguessable
-- link (vendedor/WhatsApp agent shares it). The token is a random uuid — public
-- but not enumerable — separate from the internal id so sharing it never leaks
-- the id used in staff URLs, and it can be rotated if ever needed.
--
-- A volatile default forces per-row evaluation, so existing quotes each get a
-- distinct token on this ALTER.
ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS share_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS cotizaciones_share_token_idx
  ON public.cotizaciones (share_token);
