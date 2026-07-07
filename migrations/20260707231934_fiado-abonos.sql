-- Partial payments (abonos) for fiados. A fiado accumulates sale_pagos until it
-- reaches the total, then it completes. The corte will attribute a fiado's cash
-- to its abonos (by day/method) instead of the full total at settle time.
CREATE TABLE public.sale_pagos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id     uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  monto_cents int  NOT NULL CHECK (monto_cents > 0),
  metodo      text NOT NULL
                CHECK (metodo IN ('efectivo', 'tarjeta', 'transferencia', 'otro')),
  created_by  text NOT NULL DEFAULT public.requesting_user_id(),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sale_pagos_sale_idx       ON public.sale_pagos (sale_id);
CREATE INDEX sale_pagos_created_at_idx ON public.sale_pagos (created_at);

ALTER TABLE public.sale_pagos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read sale_pagos"
  ON public.sale_pagos FOR SELECT TO authenticated
  USING (public.requesting_user_id() IS NOT NULL);
GRANT SELECT ON public.sale_pagos TO authenticated;

-- Backfill: every already-settled fiado (completed sale with settled_at) becomes
-- one abono for its full total, dated at settlement, so historical cortes stay
-- correct once they read cash from sale_pagos. Direct sales (settled_at NULL) are
-- untouched — they're paid in full at register via payment_method.
INSERT INTO public.sale_pagos (sale_id, monto_cents, metodo, created_by, created_at)
SELECT s.id, s.total_cents,
       COALESCE(s.payment_method, 'efectivo'),
       COALESCE(s.sold_by, 'backfill'),
       s.settled_at
FROM public.sales s
WHERE s.status = 'completed'
  AND s.settled_at IS NOT NULL
  AND s.total_cents > 0
  AND NOT EXISTS (SELECT 1 FROM public.sale_pagos p WHERE p.sale_id = s.id);

CREATE OR REPLACE FUNCTION public.fiado_pagado(p_sale_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT COALESCE(SUM(monto_cents), 0)::int
  FROM public.sale_pagos WHERE sale_id = p_sale_id;
$$;

-- Add an abono to a fiado. When the total is reached, the fiado completes.
CREATE OR REPLACE FUNCTION public.abonar_fiado(
  p_sale_id     uuid,
  p_monto_cents int,
  p_metodo      text
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid    text := public.requesting_user_id();
  v_status text;
  v_total  int;
  v_pagado int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING errcode = '28000'; END IF;
  IF p_monto_cents IS NULL OR p_monto_cents <= 0 THEN RAISE EXCEPTION 'monto inválido'; END IF;
  IF p_metodo IS NULL OR p_metodo NOT IN ('efectivo','tarjeta','transferencia','otro') THEN
    RAISE EXCEPTION 'método inválido';
  END IF;

  SELECT status, total_cents INTO v_status, v_total
  FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'fiado no encontrado'; END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'el fiado no está pendiente (%)', v_status; END IF;

  v_pagado := public.fiado_pagado(p_sale_id);
  IF v_pagado + p_monto_cents > v_total THEN
    RAISE EXCEPTION 'el abono excede lo que falta (pagado %, total %)', v_pagado, v_total;
  END IF;

  INSERT INTO public.sale_pagos (sale_id, monto_cents, metodo, created_by)
  VALUES (p_sale_id, p_monto_cents, p_metodo, v_uid);

  v_pagado := v_pagado + p_monto_cents;
  IF v_pagado >= v_total THEN
    UPDATE public.sales
    SET status = 'completed', payment_method = p_metodo, settled_at = now()
    WHERE id = p_sale_id;
  END IF;

  RETURN v_pagado;
END;
$$;

-- "Cobrar" now settles the REMAINING balance as one abono, then completes.
CREATE OR REPLACE FUNCTION public.settle_loan(
  p_sale_id        uuid,
  p_payment_method text DEFAULT 'efectivo'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid    text := public.requesting_user_id();
  v_status text;
  v_total  int;
  v_resta  int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING errcode = '28000'; END IF;
  IF p_payment_method NOT IN ('efectivo', 'tarjeta', 'transferencia', 'otro') THEN
    RAISE EXCEPTION 'invalid payment method %', p_payment_method;
  END IF;

  SELECT status, total_cents INTO v_status, v_total
  FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'loan not found'; END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'loan is not pending (status %)', v_status; END IF;

  v_resta := v_total - public.fiado_pagado(p_sale_id);
  IF v_resta > 0 THEN
    INSERT INTO public.sale_pagos (sale_id, monto_cents, metodo, created_by)
    VALUES (p_sale_id, v_resta, p_payment_method, v_uid);
  END IF;

  UPDATE public.sales
  SET status = 'completed', payment_method = p_payment_method, settled_at = now()
  WHERE id = p_sale_id;
END;
$$;
