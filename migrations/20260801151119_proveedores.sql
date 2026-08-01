-- Proveedores (R5) — the root the supplier cluster hangs off: supplier credit
-- notes (R6), fulfilling one sale from several suppliers (R7), per-SKU purchase
-- history (R1).
--
-- The supplier lives on the PRODUCT, not the warehouse: one warehouse can hold
-- goods from several suppliers, and the same part bought from a different
-- supplier is a different SKU anyway. So a product's delivery time is derived
-- from its supplier, which also settles E5 (tiempos de entrega por almacén) —
-- the wait is the SUPPLIER's warehouse, not ours.
CREATE TABLE public.proveedores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          text NOT NULL,
  telefono        text,
  contacto        text,           -- persona con quien se trata
  -- 0 = lo tenemos aquí, entrega inmediata. >0 = días hábiles en llegar.
  lead_time_dias  smallint NOT NULL DEFAULT 0
                    CHECK (lead_time_dias >= 0 AND lead_time_dias <= 120),
  notas           text,
  is_active       boolean NOT NULL DEFAULT true,
  created_by      text NOT NULL DEFAULT public.requesting_user_id(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX proveedores_nombre_idx ON public.proveedores (lower(nombre));
-- Same supplier twice is a data-entry slip, not a business case.
CREATE UNIQUE INDEX proveedores_nombre_uidx ON public.proveedores (lower(btrim(nombre)));

CREATE TRIGGER proveedores_touch_updated_at
  BEFORE UPDATE ON public.proveedores
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;

-- Same posture as inventories: everyone on staff reads, admins write. Server
-- Actions gate on `inventario_gestionar` and go through the admin client.
CREATE POLICY "authenticated read proveedores"
  ON public.proveedores FOR SELECT TO authenticated
  USING (public.requesting_user_id() IS NOT NULL);
CREATE POLICY "admin insert proveedores"
  ON public.proveedores FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY "admin update proveedores"
  ON public.proveedores FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE DELETE ON public.proveedores FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.proveedores TO authenticated;

-- Nullable: NULL means our own stock, nothing to wait for.
ALTER TABLE public.products
  ADD COLUMN proveedor_id uuid REFERENCES public.proveedores(id);
CREATE INDEX products_proveedor_idx ON public.products (proveedor_id);
