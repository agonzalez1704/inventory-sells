-- A cash withdrawal that bought a part for a specific sale.
--
-- "Pieza de fuera": the counter takes cash from the drawer, buys the part at
-- the shop next door and hands it to the customer on credit. The cash leaves
-- as a gasto and comes back when the note is collected, so the note has to
-- know which withdrawal it repays — and the corte, which gastos were really
-- merchandise for a sale.

ALTER TABLE public.gastos ADD COLUMN IF NOT EXISTS sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS gastos_sale_idx ON public.gastos (sale_id) WHERE sale_id IS NOT NULL;
