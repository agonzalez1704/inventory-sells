-- Dashboards generativos (port del patron de e-commerce): el spec es un JSON
-- declarativo de primitivas (kpi, serie, distribucion, tabla, nota) sobre un
-- DSL de consulta acotado. El modelo compone specs; los datos se consultan al
-- render en el servidor. Guardia a nivel de app (Clerk + permisos), como el
-- resto de las tablas.

CREATE TABLE IF NOT EXISTS public.dashboards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL,
  spec        JSONB NOT NULL,
  creado_por  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dashboards_versiones (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id UUID NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
  spec         JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dash_versiones ON public.dashboards_versiones(dashboard_id, created_at DESC);
