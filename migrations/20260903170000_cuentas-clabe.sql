-- Accounts are registered by CLABE now: the first 3 digits name the bank, so
-- the form detects it instead of asking. Stored for the config list (and for
-- telling two same-bank accounts apart by their last digits).
ALTER TABLE public.cuentas_negocio ADD COLUMN IF NOT EXISTS clabe text;
