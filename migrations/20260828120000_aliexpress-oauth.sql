-- AliExpress OAuth tokens for the dropshipping app (fase 2 groundwork).
--
-- In config_negocio because they are per-shop state, not code: Fiable connects
-- its own AliExpress account; Ruli simply never will. The columns are written
-- only by the OAuth callback route (admin client) and read by the future
-- auto-order job.
ALTER TABLE public.config_negocio
  ADD COLUMN IF NOT EXISTS aliexpress_token text,
  ADD COLUMN IF NOT EXISTS aliexpress_refresh text,
  ADD COLUMN IF NOT EXISTS aliexpress_expira timestamptz;
