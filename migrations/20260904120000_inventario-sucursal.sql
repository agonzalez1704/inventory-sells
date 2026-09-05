-- Physical location for an inventory: link it to a sucursal and only sellers
-- checked in AT that sucursal can sell its pieces. NULL = no physical branch
-- (dropship, general stock) — sellable from anywhere, and the whole feature
-- stays inert for shops without branches. Enforcement lives in the sale
-- server actions; admins and unassigned staff are exempt, same as the geo gate.
ALTER TABLE public.inventories
  ADD COLUMN IF NOT EXISTS sucursal_id uuid REFERENCES public.sucursales(id);
