-- Off switch for the WhatsApp agent. Turning it off used to mean removing the
-- webhook or redeploying; now it is a toggle in Configuración. While off,
-- customer messages still land in the bandeja — people answer, the agent
-- stays quiet. On by default: nothing changes until somebody flips it.
ALTER TABLE public.config_negocio
  ADD COLUMN IF NOT EXISTS agente_activo boolean NOT NULL DEFAULT true;
