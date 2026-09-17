-- Pedidos + Por surtir redesign.
--
-- 1) A paid web order had nowhere to go: the app tracked payment and dropship
--    and nothing else, so "is it ready?", "did it ship?" and "who picked it
--    up?" lived in people's heads and WhatsApp. These columns are that trail.
-- 2) Por surtir listed what to buy but not what was already asked for, so the
--    same piece got ordered twice (or nobody knew it was coming).

ALTER TABLE public.ordenes_web
  ADD COLUMN IF NOT EXISTS preparado_at    timestamptz,
  ADD COLUMN IF NOT EXISTS preparado_por   text,
  ADD COLUMN IF NOT EXISTS listo_at        timestamptz,
  ADD COLUMN IF NOT EXISTS enviado_at      timestamptz,
  ADD COLUMN IF NOT EXISTS entregado_at    timestamptz,
  ADD COLUMN IF NOT EXISTS entregado_por   text,
  -- Shipping is bought outside the app (the user's call), so the label's data
  -- is captured: carrier, tracking number, and what it really cost — the only
  -- way to know whether what the customer paid for shipping covered it.
  ADD COLUMN IF NOT EXISTS guia_paqueteria text,
  ADD COLUMN IF NOT EXISTS guia_numero     text,
  ADD COLUMN IF NOT EXISTS guia_costo_cents integer CHECK (guia_costo_cents IS NULL OR guia_costo_cents >= 0),
  ADD COLUMN IF NOT EXISTS entrega_nota    text;

CREATE INDEX IF NOT EXISTS ordenes_web_pendientes_idx
  ON public.ordenes_web (status, entregado_at, created_at DESC);

/**
 * Move a paid order along: preparado → listo (pickup) / enviado (shipping) →
 * entregado. One function so every step checks the same things and the order
 * can never skip from paid to delivered without a trace.
 *
 * p_paso: 'preparado' | 'listo' | 'enviado' | 'entregado' | 'deshacer'
 * p_datos (enviado): {paqueteria, numero, costo_cents}; (entregado): {nota}
 */
CREATE OR REPLACE FUNCTION public.avanzar_orden_web(
  p_id    uuid,
  p_paso  text,
  p_datos jsonb DEFAULT '{}'::jsonb
)
RETURNS public.ordenes_web
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_uid text := public.requesting_user_id();
  o     public.ordenes_web%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF NOT (public.is_admin() OR public.has_permiso('surtir')) THEN
    RAISE EXCEPTION 'No tienes permiso para preparar pedidos' USING errcode = '42501';
  END IF;

  SELECT * INTO o FROM public.ordenes_web WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado';
  END IF;
  IF p_paso <> 'deshacer' AND o.status <> 'pagada' THEN
    RAISE EXCEPTION 'El pedido todavía no está pagado';
  END IF;

  IF p_paso = 'preparado' THEN
    UPDATE public.ordenes_web
       SET preparado_at = coalesce(preparado_at, now()), preparado_por = coalesce(preparado_por, v_uid)
     WHERE id = p_id;

  ELSIF p_paso = 'listo' THEN
    IF o.tipo_entrega <> 'recoger' THEN
      RAISE EXCEPTION 'Este pedido es a domicilio: captura la guía';
    END IF;
    UPDATE public.ordenes_web
       SET preparado_at = coalesce(preparado_at, now()), preparado_por = coalesce(preparado_por, v_uid),
           listo_at = coalesce(listo_at, now())
     WHERE id = p_id;

  ELSIF p_paso = 'enviado' THEN
    IF o.tipo_entrega <> 'envio' THEN
      RAISE EXCEPTION 'Este pedido se recoge en sucursal';
    END IF;
    IF coalesce(btrim(p_datos ->> 'numero'), '') = '' OR coalesce(btrim(p_datos ->> 'paqueteria'), '') = '' THEN
      RAISE EXCEPTION 'Falta la paquetería o el número de guía';
    END IF;
    UPDATE public.ordenes_web
       SET preparado_at = coalesce(preparado_at, now()), preparado_por = coalesce(preparado_por, v_uid),
           enviado_at = coalesce(enviado_at, now()),
           guia_paqueteria = btrim(p_datos ->> 'paqueteria'),
           guia_numero = btrim(p_datos ->> 'numero'),
           guia_costo_cents = nullif(p_datos ->> 'costo_cents', '')::integer
     WHERE id = p_id;

  ELSIF p_paso = 'entregado' THEN
    UPDATE public.ordenes_web
       SET preparado_at = coalesce(preparado_at, now()),
           entregado_at = coalesce(entregado_at, now()), entregado_por = v_uid,
           entrega_nota = nullif(btrim(p_datos ->> 'nota'), '')
     WHERE id = p_id;

  ELSIF p_paso = 'deshacer' THEN
    -- One step back, for the usual "clicked the wrong order".
    IF o.entregado_at IS NOT NULL THEN
      UPDATE public.ordenes_web SET entregado_at = NULL, entregado_por = NULL, entrega_nota = NULL WHERE id = p_id;
    ELSIF o.enviado_at IS NOT NULL THEN
      UPDATE public.ordenes_web SET enviado_at = NULL, guia_paqueteria = NULL, guia_numero = NULL, guia_costo_cents = NULL WHERE id = p_id;
    ELSIF o.listo_at IS NOT NULL THEN
      UPDATE public.ordenes_web SET listo_at = NULL WHERE id = p_id;
    ELSIF o.preparado_at IS NOT NULL THEN
      UPDATE public.ordenes_web SET preparado_at = NULL, preparado_por = NULL WHERE id = p_id;
    END IF;

  ELSE
    RAISE EXCEPTION 'Paso inválido %', p_paso;
  END IF;

  SELECT * INTO o FROM public.ordenes_web WHERE id = p_id;
  RETURN o;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.avanzar_orden_web(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.avanzar_orden_web(uuid, text, jsonb) TO authenticated;

-- What has already been asked of a supplier, so Por surtir stops asking for it
-- again and the buyer can see what is on its way.
CREATE TABLE IF NOT EXISTS public.surtido_pedidos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku          text NOT NULL,
  nombre       text,
  qty          integer NOT NULL CHECK (qty > 0),
  proveedor_id uuid REFERENCES public.proveedores(id) ON DELETE SET NULL,
  estado       text NOT NULL DEFAULT 'pedido' CHECK (estado IN ('pedido', 'recibido', 'cancelado')),
  nota         text CHECK (nota IS NULL OR length(nota) <= 300),
  pedido_por   text,
  pedido_at    timestamptz NOT NULL DEFAULT now(),
  cerrado_at   timestamptz
);
CREATE INDEX IF NOT EXISTS surtido_pedidos_abiertos_idx ON public.surtido_pedidos (estado, sku);
ALTER TABLE public.surtido_pedidos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "surtir lee surtido_pedidos" ON public.surtido_pedidos
    FOR SELECT TO authenticated
    USING (public.is_admin() OR public.has_permiso('surtir'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT ON public.surtido_pedidos TO authenticated;
