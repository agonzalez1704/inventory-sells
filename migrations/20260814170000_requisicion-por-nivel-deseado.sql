-- Trigger the list on the desired level, not on the reorder point.
--
-- The first version only listed a part once the shelf fell to the reorder
-- point — the cover for the supplier's wait. That is the rule for continuous
-- review, where you can order the moment anything dips. This shop orders in
-- batches: somebody sits down, generates a requisition, and sends it. Under
-- periodic review the question is not "is it urgent yet" but "is it below what
-- we want to have", which is what was asked for in the first place.
--
-- The failure was not subtle and it hit the best-selling part in the shop:
--
--   BAT IPH 13 A2655 — sells 2.00/week, 2 on the shelf, supplier delivers in
--   2 days. Reorder point ceil(2.00 × 2/7) = 1, so 2 on hand read as "fine",
--   while the target for three weeks of cover is 7. Five pieces short of the
--   top seller, invisible.
--
-- Note what the lead time was doing: a SHORTER wait makes the reorder point
-- SMALLER, so the parts from the fastest supplier were the hardest to get onto
-- the list. Backwards. All four best sellers were sitting above their reorder
-- point and far below their target.
--
-- Column names and the return shape are unchanged on purpose — the module is
-- already deployed, and renaming what an RPC returns breaks the running code
-- before the new code reaches it.
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
      coalesce(b.min_manual, ceil(b.por_semana * (b.lead / 7.0))::integer) AS nmin,
      -- What the shop wants to have on the shelf: enough to sell through the
      -- coverage period plus the wait for the next delivery. A hand-set minimum
      -- is a floor on this too — asking to keep five and being topped up to
      -- three would ignore the instruction.
      greatest(
        coalesce(
          b.max_manual,
          ceil(b.por_semana * (b.lead / 7.0 + p_cobertura_semanas))::integer
        ),
        coalesce(b.min_manual, 0)
      ) AS nobj
    FROM base b
  )
  SELECT
    n.id, n.sku, n.name, n.inv_nombre, n.proveedor_id, n.prov_nombre,
    n.quantity,
    round(n.por_semana, 2),
    n.lead,
    n.nmin,
    n.nobj,
    (n.min_manual IS NOT NULL OR n.max_manual IS NOT NULL),
    n.en_camino,
    greatest(n.nobj - n.quantity - n.en_camino, 0)::integer,
    CASE
      WHEN n.por_semana = 0 THEN 'agotado'
      WHEN n.min_manual IS NOT NULL OR n.max_manual IS NOT NULL THEN 'minimo'
      ELSE 'ritmo'
    END,
    CASE WHEN v_ve_costos THEN n.cost_cents END
  FROM niveles n
  WHERE
    -- Below what the shop wants to have, counting what is already on its way.
    (n.quantity + n.en_camino < n.nobj)
    -- Or empty with no sales to go on: the case the arithmetic gets wrong,
    -- surfaced rather than filtered out so a human or the model can judge it.
    OR (n.quantity <= 0 AND n.por_semana = 0 AND n.en_camino = 0)
  ORDER BY
    (n.quantity <= 0) DESC,   -- empties first
    n.por_semana DESC,
    n.name
  LIMIT p_limite;
END;
$$;

GRANT EXECUTE ON FUNCTION public.requisicion_sugerida(uuid[], integer, integer, integer) TO authenticated;
