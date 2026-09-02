-- Whether a transfer payment REQUIRES its proof (reference or screenshot).
-- Off by default — today's behavior. The shop flips it in Configuración when
-- it decides an unproven transfer is not a payment.
ALTER TABLE public.config_negocio
  ADD COLUMN IF NOT EXISTS comprobante_obligatorio boolean NOT NULL DEFAULT false;
