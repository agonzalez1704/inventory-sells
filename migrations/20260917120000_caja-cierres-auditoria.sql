-- Caja: daily cash counts/closes, and an audit trail of the changes that make
-- the drawer stop matching (Ventas y Caja redesign, "Cuadre del día").
--
-- Why: the corte is computed from the data, so a mismatch only shows up when
-- someone counts — days later — and then there is nothing to compare against
-- and no trace of edits. A count pins the drawer at a moment; the audit says
-- what changed after the fact.

-- One row per count. 'conteo' = a checkpoint during the day (any number);
-- 'cierre' = the end of the day (one per day per drawer). A drawer is a
-- sucursal; NULL sucursal = the business without branches (or "sin sucursal").
CREATE TABLE IF NOT EXISTS public.caja_conteos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha                 date NOT NULL,
  sucursal_id           uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  tipo                  text NOT NULL CHECK (tipo IN ('conteo', 'cierre')),
  contado_cents         bigint NOT NULL CHECK (contado_cents >= 0),
  -- What the system said there should be at that moment (snapshot: later
  -- edits must not silently rewrite yesterday's difference).
  esperado_cents        bigint NOT NULL,
  -- Bills and coins as counted: {"1000": 1, "500": 2, ..., "monedas_cents": 3500}.
  desglose              jsonb,
  -- Cierre only: the float left in the drawer for the next day.
  fondo_siguiente_cents bigint CHECK (fondo_siguiente_cents IS NULL OR fondo_siguiente_cents >= 0),
  nota                  text CHECK (nota IS NULL OR length(nota) <= 500),
  created_by            text,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS caja_conteos_dia_idx ON public.caja_conteos (fecha, sucursal_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS caja_conteos_un_cierre
  ON public.caja_conteos (fecha, coalesce(sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE tipo = 'cierre';
ALTER TABLE public.caja_conteos ENABLE ROW LEVEL SECURITY;

-- What changed on money rows after they were written. Read and written only
-- by the server (admin client) and the triggers below.
CREATE TABLE IF NOT EXISTS public.caja_auditoria (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidad     text NOT NULL CHECK (entidad IN ('venta', 'pago_fiado', 'gasto', 'ingreso')),
  entidad_id  uuid NOT NULL,
  accion      text NOT NULL CHECK (accion IN ('cambio', 'borrado')),
  antes       jsonb NOT NULL,
  despues     jsonb,
  quien       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS caja_auditoria_fecha_idx ON public.caja_auditoria (created_at);
CREATE INDEX IF NOT EXISTS caja_auditoria_entidad_idx ON public.caja_auditoria (entidad, entidad_id);
ALTER TABLE public.caja_auditoria ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.auditar_caja()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_quien text;
BEGIN
  BEGIN
    v_quien := public.requesting_user_id();
  EXCEPTION WHEN OTHERS THEN
    v_quien := NULL;
  END;

  IF TG_TABLE_NAME = 'sales' THEN
    -- Settling a credit note (pending → completed) is the normal flow, not an edit.
    IF OLD.status = 'pending' AND NEW.status = 'completed' THEN
      RETURN NEW;
    END IF;
    IF OLD.payment_method IS DISTINCT FROM NEW.payment_method
       OR OLD.total_cents IS DISTINCT FROM NEW.total_cents
       OR OLD.status IS DISTINCT FROM NEW.status
       OR OLD.customer_name IS DISTINCT FROM NEW.customer_name THEN
      INSERT INTO public.caja_auditoria (entidad, entidad_id, accion, antes, despues, quien)
      VALUES ('venta', OLD.id, 'cambio',
        jsonb_build_object('payment_method', OLD.payment_method, 'total_cents', OLD.total_cents,
                           'status', OLD.status, 'customer_name', OLD.customer_name, 'created_at', OLD.created_at),
        jsonb_build_object('payment_method', NEW.payment_method, 'total_cents', NEW.total_cents,
                           'status', NEW.status, 'customer_name', NEW.customer_name),
        v_quien);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.caja_auditoria (entidad, entidad_id, accion, antes, quien)
    VALUES (CASE TG_TABLE_NAME WHEN 'sale_pagos' THEN 'pago_fiado' WHEN 'gastos' THEN 'gasto' ELSE 'ingreso' END,
            OLD.id, 'borrado', to_jsonb(OLD), v_quien);
    RETURN OLD;
  END IF;

  -- sale_pagos UPDATE
  IF OLD.monto_cents IS DISTINCT FROM NEW.monto_cents OR OLD.metodo IS DISTINCT FROM NEW.metodo THEN
    INSERT INTO public.caja_auditoria (entidad, entidad_id, accion, antes, despues, quien)
    VALUES ('pago_fiado', OLD.id, 'cambio', to_jsonb(OLD), to_jsonb(NEW), v_quien);
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS auditar_caja_sales ON public.sales;
CREATE TRIGGER auditar_caja_sales AFTER UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.auditar_caja();
DROP TRIGGER IF EXISTS auditar_caja_sale_pagos ON public.sale_pagos;
CREATE TRIGGER auditar_caja_sale_pagos AFTER UPDATE OR DELETE ON public.sale_pagos
  FOR EACH ROW EXECUTE FUNCTION public.auditar_caja();
DROP TRIGGER IF EXISTS auditar_caja_gastos ON public.gastos;
CREATE TRIGGER auditar_caja_gastos AFTER DELETE ON public.gastos
  FOR EACH ROW EXECUTE FUNCTION public.auditar_caja();
DROP TRIGGER IF EXISTS auditar_caja_ingresos ON public.ingresos;
CREATE TRIGGER auditar_caja_ingresos AFTER DELETE ON public.ingresos
  FOR EACH ROW EXECUTE FUNCTION public.auditar_caja();

REVOKE EXECUTE ON FUNCTION public.auditar_caja() FROM PUBLIC;
