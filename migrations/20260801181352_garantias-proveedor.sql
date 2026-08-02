-- Garantías a proveedor (R9) — parts we send back under warranty, tracked as a
-- balance the SUPPLIER owes US until they credit it.
--
-- Deliberately NOT linked to the purchase it came from. The business was
-- explicit: "no necesitamos nosotros saber de qué nota viene ni nada" — the
-- supplier's own rep digs that up when it matters. Dropping that link is what
-- keeps this one small table instead of a traceability project.
--
-- It also does NOT move stock: the defective part left inventory when it was
-- swapped for the customer. What sits here is money owed, not goods on hand.
CREATE TABLE public.garantias_proveedor (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id  uuid NOT NULL REFERENCES public.proveedores(id),
  -- Optional link to the catalog; descripcion covers anything not catalogued.
  product_id    uuid REFERENCES public.products(id),
  descripcion   text NOT NULL,
  qty           int NOT NULL DEFAULT 1 CHECK (qty > 0),
  monto_cents   bigint NOT NULL CHECK (monto_cents >= 0),
  fecha         date NOT NULL DEFAULT current_date,
  estado        text NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente', 'aplicada', 'rechazada')),
  -- How it ended: credited on an invoice, replaced with a new part, refused…
  resolucion    text,
  resuelta_at   timestamptz,
  notas         text,
  created_by    text NOT NULL DEFAULT public.requesting_user_id(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX garantias_proveedor_idx ON public.garantias_proveedor (proveedor_id, estado);
CREATE INDEX garantias_fecha_idx     ON public.garantias_proveedor (fecha DESC);

CREATE TRIGGER garantias_touch_updated_at
  BEFORE UPDATE ON public.garantias_proveedor
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- What each supplier still owes us in warranties — the one number the business
-- actually asked for ("se mantenga como nos debe este adeudo de garantías").
CREATE OR REPLACE VIEW public.garantias_saldo AS
  SELECT p.id AS proveedor_id,
         p.nombre,
         coalesce(sum(g.monto_cents) FILTER (WHERE g.estado = 'pendiente'), 0) AS pendiente_cents,
         count(*) FILTER (WHERE g.estado = 'pendiente')                        AS pendientes,
         count(*) FILTER (WHERE g.estado = 'aplicada')                         AS aplicadas
    FROM public.proveedores p
    LEFT JOIN public.garantias_proveedor g ON g.proveedor_id = p.id
   GROUP BY p.id, p.nombre;

GRANT SELECT ON public.garantias_saldo TO authenticated;

ALTER TABLE public.garantias_proveedor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin all garantias" ON public.garantias_proveedor
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.garantias_proveedor TO authenticated;
