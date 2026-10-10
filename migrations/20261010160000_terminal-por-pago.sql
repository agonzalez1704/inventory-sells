-- The terminal of an abono or an apartado payment rides on the payment row.
--
-- A credit note can take several card abonos on different terminals, and an
-- apartado several payments: one terminal per sale or per adelanto cannot hold
-- that. Each sale_pagos / adelanto_pagos row now carries its own terminal and
-- its frozen commission. A POS sale keeps sales.terminal_id (its split card
-- part lands in sale_pagos with no terminal of its own, and falls back to it).
--
-- adelantos.terminal_id from the previous migration was never written: gone.

ALTER TABLE public.sale_pagos ADD COLUMN IF NOT EXISTS terminal_id uuid REFERENCES public.terminales_pago(id) ON DELETE SET NULL;
ALTER TABLE public.sale_pagos ADD COLUMN IF NOT EXISTS terminal_comision_pct numeric(7,4);
ALTER TABLE public.adelanto_pagos ADD COLUMN IF NOT EXISTS terminal_id uuid REFERENCES public.terminales_pago(id) ON DELETE SET NULL;
ALTER TABLE public.adelanto_pagos ADD COLUMN IF NOT EXISTS terminal_comision_pct numeric(7,4);

ALTER TABLE public.adelantos DROP COLUMN IF EXISTS terminal_id;
ALTER TABLE public.adelantos DROP COLUMN IF EXISTS terminal_comision_pct;
