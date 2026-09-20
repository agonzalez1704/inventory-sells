-- Saving Configuración has been failing with "permission denied for table
-- config_negocio".
--
-- The grants were per COLUMN (info, asesores, valor_base, tienda), so every
-- column added since — fiado_exige_cliente, pos_click_abre_detalle,
-- comprobante_obligatorio — was unwritable, and updateNegocioInfo writes
-- fiado_exige_cliente in the same statement as tienda: the whole save was
-- rejected, including the ticket's header and warranty terms.
--
-- The grant now covers the table, which is what the RLS policy was always the
-- real guard for: "admin update config_negocio" allows the row only when
-- is_admin(), so a seller still cannot write a single column. A column added
-- tomorrow no longer silently breaks the form.

GRANT UPDATE ON public.config_negocio TO authenticated;
