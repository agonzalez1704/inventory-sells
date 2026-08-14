-- Requisiciones: what to buy, before anybody buys it.
--
-- /surtido already answers a neighbouring question — what live quotes promise
-- beyond the shelf — but it is demand-driven: nothing appears until a customer
-- asks. This one is level-driven, so a part that quietly ran out and that nobody
-- has quoted still shows up.
--
-- The list is arithmetic, deliberately. "Below the desired level, empties first"
-- is a WHERE and an ORDER BY, and a language model doing that subtraction would
-- be slower, cost money per run, and be able to get it wrong. What the model is
-- for is the blind spot this file cannot fix: see requisicion_sugerida below.

-- ---------------------------------------------------------------------------
-- Overrides, not settings.
--
-- Both levels are computed from the sales rate every time the list is built, so
-- they follow the shop without anybody maintaining them. These two columns are
-- for the cases where the buyer knows something the history does not — a part
-- they always keep five of, a discontinued model they want to run down to zero.
-- NULL means "use the formula", which is why neither has a default.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_min integer,
  ADD COLUMN IF NOT EXISTS stock_max integer;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS stock_niveles_coherentes;
ALTER TABLE public.products ADD CONSTRAINT stock_niveles_coherentes CHECK (
  (stock_min IS NULL OR stock_min >= 0)
  AND (stock_max IS NULL OR stock_max >= 0)
  -- An order-up-to level below the reorder point orders a negative quantity.
  AND (stock_min IS NULL OR stock_max IS NULL OR stock_max >= stock_min)
);

-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.requisiciones_folio_seq;

CREATE TABLE IF NOT EXISTS public.requisiciones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio             text NOT NULL UNIQUE
                      DEFAULT 'REQ-' || lpad(nextval('public.requisiciones_folio_seq')::text, 4, '0'),
  estado            text NOT NULL DEFAULT 'borrador'
                      CHECK (estado IN ('borrador', 'enviada', 'cerrada')),
  -- Which inventories were asked for. Kept so the document can say what it
  -- covered — regenerating it later against a different selection is a
  -- different document.
  inventarios       uuid[] NOT NULL,
  -- The knob. Weeks of cover the quantities aim for; the whole list moves with
  -- it, and the right value is a property of how often this shop orders.
  cobertura_semanas integer NOT NULL DEFAULT 3 CHECK (cobertura_semanas BETWEEN 1 AND 26),
  notas             text,
  created_by        text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  enviada_at        timestamptz
);

CREATE TABLE IF NOT EXISTS public.requisicion_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisicion_id        uuid NOT NULL REFERENCES public.requisiciones(id) ON DELETE CASCADE,
  product_id            uuid NOT NULL REFERENCES public.products(id),
  qty                   integer NOT NULL CHECK (qty > 0),
  -- What the calculation proposed, kept even after the buyer overrides it.
  -- "Asked for 10, the system said 3" is the only way to tell later whether the
  -- formula is wrong or the buyer was right.
  qty_sugerida          integer NOT NULL,
  -- Frozen at generation time. The shelf moves; the document should still be
  -- able to explain why the line was on it.
  existencia_al_generar integer NOT NULL,
  ritmo_semanal         numeric(8,2),
  motivo                text,
  fuente                text NOT NULL CHECK (fuente IN ('ritmo', 'minimo', 'agotado', 'ia')),
  -- The same part twice in one requisition is two people ordering it once each.
  UNIQUE (requisicion_id, product_id)
);

CREATE INDEX IF NOT EXISTS requisicion_items_req_idx
  ON public.requisicion_items (requisicion_id);

ALTER TABLE public.requisiciones      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requisicion_items  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS requisiciones_leer ON public.requisiciones;
CREATE POLICY requisiciones_leer ON public.requisiciones
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS requisiciones_escribir ON public.requisiciones;
CREATE POLICY requisiciones_escribir ON public.requisiciones
  FOR ALL TO authenticated
  USING (public.tiene_permiso('inventario_gestionar'))
  WITH CHECK (public.tiene_permiso('inventario_gestionar'));

DROP POLICY IF EXISTS requisicion_items_leer ON public.requisicion_items;
CREATE POLICY requisicion_items_leer ON public.requisicion_items
  FOR SELECT TO authenticated USING (true);

-- Editing quantities and dropping lines is the whole point of the draft, so it
-- goes straight through PostgREST rather than through an RPC per verb. The
-- policy carries the rule that matters: once it is sent, it is a document
-- somebody acted on, not a scratchpad.
DROP POLICY IF EXISTS requisicion_items_escribir ON public.requisicion_items;
CREATE POLICY requisicion_items_escribir ON public.requisicion_items
  FOR ALL TO authenticated
  USING (
    public.tiene_permiso('inventario_gestionar')
    AND EXISTS (
      SELECT 1 FROM public.requisiciones r
      WHERE r.id = requisicion_id AND r.estado = 'borrador'
    )
  )
  WITH CHECK (
    public.tiene_permiso('inventario_gestionar')
    AND EXISTS (
      SELECT 1 FROM public.requisiciones r
      WHERE r.id = requisicion_id AND r.estado = 'borrador'
    )
  );

-- ---------------------------------------------------------------------------
-- The proposal. Read-only: nothing here writes, so it can be re-run freely
-- while the buyer moves the coverage knob.
--
-- Two things it cannot see, both handed to the caller rather than hidden:
--
--   * A part that has been at zero for weeks sold nothing, so its rate is 0 and
--     the arithmetic ranks it last — exactly backwards. Those come back with
--     fuente='agotado' and qty_sugerida=0, for a human or a model to judge from
--     the model name whether the shop should still carry it.
--   * Substitutes. "A32 OLED C/M" and "A32 INCELL" are the same repair; the
--     rate treats them as unrelated and will happily propose both.
DROP FUNCTION IF EXISTS public.requisicion_sugerida(uuid[], integer, integer, integer);
CREATE FUNCTION public.requisicion_sugerida(
  p_inventarios      uuid[],
  p_cobertura_semanas integer DEFAULT 3,
  p_ventana_semanas   integer DEFAULT 8,
  p_limite            integer DEFAULT 300
)
RETURNS TABLE (
  product_id     uuid,
  sku            text,
  nombre         text,
  inventario     text,
  proveedor_id   uuid,
  proveedor      text,
  existencia     integer,
  ritmo_semanal  numeric,
  lead_dias      integer,
  stock_min      integer,
  stock_max      integer,
  es_override    boolean,
  ya_pedido      integer,
  sugerido       integer,
  fuente         text,
  costo_cents    integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_ve_costos boolean := public.tiene_permiso('costos_ver');
BEGIN
  IF NOT public.tiene_permiso('inventario_gestionar') THEN
    RAISE EXCEPTION 'sin permiso para generar requisiciones' USING errcode = '42501';
  END IF;
  IF p_inventarios IS NULL OR cardinality(p_inventarios) = 0 THEN
    RAISE EXCEPTION 'elige al menos un inventario';
  END IF;

  RETURN QUERY
  WITH ritmo AS (
    SELECT si.product_id AS pid,
           sum(si.qty)::numeric / p_ventana_semanas AS por_semana
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id AND s.status = 'completed'
    WHERE s.created_at > now() - (p_ventana_semanas || ' weeks')::interval
    GROUP BY si.product_id
  ),
  -- Already asked for on a requisition that went out and has not been closed.
  -- Without this the second requisition of the week re-orders everything the
  -- first one did, because none of it is on the shelf yet.
  pedido AS (
    SELECT ri.product_id AS pid, sum(ri.qty)::integer AS piezas
    FROM public.requisicion_items ri
    JOIN public.requisiciones r ON r.id = ri.requisicion_id AND r.estado = 'enviada'
    GROUP BY ri.product_id
  ),
  base AS (
    SELECT
      p.id, p.sku, p.name, p.quantity, p.cost_cents, p.proveedor_id,
      i.name AS inv_nombre,
      pr.nombre AS prov_nombre,
      coalesce(pr.lead_time_dias, 7) AS lead,
      coalesce(rt.por_semana, 0) AS por_semana,
      coalesce(pd.piezas, 0) AS en_camino,
      p.stock_min AS min_manual,
      p.stock_max AS max_manual
    FROM public.products p
    JOIN public.inventories i ON i.id = p.inventory_id
    LEFT JOIN public.proveedores pr ON pr.id = p.proveedor_id
    LEFT JOIN ritmo rt ON rt.pid = p.id
    LEFT JOIN pedido pd ON pd.pid = p.id
    WHERE p.is_active AND p.inventory_id = ANY(p_inventarios)
  ),
  niveles AS (
    SELECT b.*,
      -- Reorder point: cover the supplier's wait. Order-up-to: the wait plus
      -- the period being covered.
      coalesce(b.min_manual, ceil(b.por_semana * (b.lead / 7.0))::integer) AS nmin,
      coalesce(
        b.max_manual,
        ceil(b.por_semana * (b.lead / 7.0 + p_cobertura_semanas))::integer
      ) AS nmax,
      (b.min_manual IS NOT NULL OR b.max_manual IS NOT NULL) AS manual
    FROM base b
  )
  SELECT
    n.id, n.sku, n.name, n.inv_nombre, n.proveedor_id, n.prov_nombre,
    n.quantity,
    round(n.por_semana, 2),
    n.lead,
    n.nmin,
    n.nmax,
    n.manual,
    n.en_camino,
    greatest(n.nmax - n.quantity - n.en_camino, 0)::integer,
    CASE
      WHEN n.por_semana = 0 THEN 'agotado'
      WHEN n.manual      THEN 'minimo'
      ELSE 'ritmo'
    END,
    CASE WHEN v_ve_costos THEN n.cost_cents END
  FROM niveles n
  WHERE
    -- Below the reorder point, counting what is already on its way.
    (n.quantity + n.en_camino <= n.nmin AND n.nmax > n.quantity + n.en_camino)
    -- Or empty with nothing to go on, which is the case the arithmetic gets
    -- wrong and therefore the one worth surfacing rather than filtering out.
    OR (n.quantity <= 0 AND n.por_semana = 0 AND n.en_camino = 0)
  ORDER BY
    (n.quantity <= 0) DESC,   -- empties first, as asked
    n.por_semana DESC,
    n.name
  LIMIT p_limite;
END;
$$;

GRANT EXECUTE ON FUNCTION public.requisicion_sugerida(uuid[], integer, integer, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- Persist what the buyer approved, in one statement.
--
-- The lines arrive as JSON because they are the edited list, not the proposed
-- one: quantities changed, rows removed. Saving is the point at which the
-- document stops being a query result.
DROP FUNCTION IF EXISTS public.crear_requisicion(uuid[], integer, jsonb, text);
CREATE FUNCTION public.crear_requisicion(
  p_inventarios       uuid[],
  p_cobertura_semanas integer,
  p_items             jsonb,
  p_notas             text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid text := public.requesting_user_id();
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF NOT public.tiene_permiso('inventario_gestionar') THEN
    RAISE EXCEPTION 'sin permiso para crear requisiciones' USING errcode = '42501';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'la requisición no tiene piezas';
  END IF;

  INSERT INTO public.requisiciones (inventarios, cobertura_semanas, notas, created_by)
  VALUES (p_inventarios, coalesce(p_cobertura_semanas, 3), NULLIF(TRIM(p_notas), ''), v_uid)
  RETURNING id INTO v_id;

  INSERT INTO public.requisicion_items (
    requisicion_id, product_id, qty, qty_sugerida,
    existencia_al_generar, ritmo_semanal, motivo, fuente
  )
  SELECT
    v_id,
    (l->>'product_id')::uuid,
    (l->>'qty')::integer,
    coalesce((l->>'qty_sugerida')::integer, (l->>'qty')::integer),
    coalesce((l->>'existencia')::integer, 0),
    (l->>'ritmo_semanal')::numeric,
    NULLIF(TRIM(l->>'motivo'), ''),
    coalesce(NULLIF(l->>'fuente', ''), 'ritmo')
  FROM jsonb_array_elements(p_items) AS l
  WHERE (l->>'qty')::integer > 0;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_requisicion(uuid[], integer, jsonb, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Sending is what makes the quantities count against the next requisition, so
-- it is a state change with a permission on it rather than a checkbox.
DROP FUNCTION IF EXISTS public.cambiar_estado_requisicion(uuid, text);
CREATE FUNCTION public.cambiar_estado_requisicion(p_id uuid, p_estado text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actual text;
BEGIN
  IF NOT public.tiene_permiso('inventario_gestionar') THEN
    RAISE EXCEPTION 'sin permiso' USING errcode = '42501';
  END IF;
  IF p_estado NOT IN ('borrador', 'enviada', 'cerrada') THEN
    RAISE EXCEPTION 'estado inválido %', p_estado;
  END IF;

  SELECT estado INTO v_actual FROM public.requisiciones WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'requisición no encontrada';
  END IF;
  -- A closed requisition is history. Reopening it would put its quantities back
  -- into the "already ordered" pool for parts that have long since arrived.
  IF v_actual = 'cerrada' THEN
    RAISE EXCEPTION 'la requisición ya está cerrada';
  END IF;

  UPDATE public.requisiciones
  SET estado = p_estado,
      enviada_at = CASE
        WHEN p_estado = 'enviada' AND enviada_at IS NULL THEN now()
        ELSE enviada_at
      END
  WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cambiar_estado_requisicion(uuid, text) TO authenticated;
