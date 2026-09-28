-- What people ask for and we don't have.
--
-- Today the shop only knows what it sold. A model nobody carries, or a piece
-- sitting at zero, leaves no trace at all: its history goes flat and the
-- restock reads it as calm. So the counter writes it down — with the hour, the
-- branch and who attended — and that demand feeds the restock like a sale that
-- was lost.

CREATE TABLE IF NOT EXISTS public.demanda_no_surtida (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- What the customer asked for, as the counter typed it.
  texto         text NOT NULL CHECK (btrim(texto) <> ''),
  -- The same text folded for grouping: lower case, no accents, single spaces.
  norm          text NOT NULL,
  tipo          text NOT NULL DEFAULT 'otro'
                  CHECK (tipo IN ('pantalla', 'bateria', 'tapa', 'flex', 'otro')),
  qty           int NOT NULL DEFAULT 1 CHECK (qty > 0 AND qty <= 999),
  -- Set when the piece DOES exist and was simply out of stock.
  product_id    uuid REFERENCES public.products(id) ON DELETE SET NULL,
  customer_id   uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  -- A phone to call back when it arrives; free text, the customer may not be
  -- registered.
  contacto      text,
  nota          text,
  sucursal_id   uuid REFERENCES public.sucursales(id),
  estado        text NOT NULL DEFAULT 'abierto'
                  CHECK (estado IN ('abierto', 'pedido', 'surtido', 'descartado')),
  cerrado_at    timestamptz,
  cerrado_por   text,
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS demanda_norm_idx   ON public.demanda_no_surtida (norm, created_at DESC);
CREATE INDEX IF NOT EXISTS demanda_estado_idx ON public.demanda_no_surtida (estado, created_at DESC);

ALTER TABLE public.demanda_no_surtida ENABLE ROW LEVEL SECURITY;
-- Server actions reach it with the admin client, which bypasses RLS; the
-- policies below are what a direct read from a browser would get.
DO $$ BEGIN
  CREATE POLICY "authenticated read demanda" ON public.demanda_no_surtida
    FOR SELECT TO authenticated USING (public.requesting_user_id() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT ON public.demanda_no_surtida TO authenticated;

/** Fold a model name so "S24 Ultra", "s24  ultra" and "S24 ÚLTRA" group as one. */
CREATE OR REPLACE FUNCTION public.normalizar_demanda(p_texto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(regexp_replace(
    lower(translate(coalesce(p_texto, ''),
      'áàäâãéèëêíìïîóòöôõúùüûñÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑ',
      'aaaaaeeeeiiiiooooouuuunAAAAAEEEEIIIIOOOOOUUUUN')),
    '[^a-z0-9]+', ' ', 'g'));
$$;

/**
 * What people asked for and we didn't have, grouped by model.
 *
 * One row per model with how many times it was asked, how many pieces, when it
 * was last asked and who is waiting — the list the buyer works from.
 */
CREATE OR REPLACE FUNCTION public.demanda_agrupada(p_dias int DEFAULT 30)
RETURNS TABLE (
  norm          text,
  texto         text,
  tipo          text,
  veces         int,
  piezas        int,
  ultima        timestamptz,
  product_id    uuid,
  producto      text,
  existencia    int,
  clientes      text,
  esperando     int,
  ids           uuid[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT
    d.norm,
    -- The most recent spelling is the one the counter recognizes.
    (array_agg(d.texto ORDER BY d.created_at DESC))[1]                           AS texto,
    (array_agg(d.tipo  ORDER BY d.created_at DESC))[1]                           AS tipo,
    count(*)::int                                                                AS veces,
    sum(d.qty)::int                                                              AS piezas,
    max(d.created_at)                                                            AS ultima,
    (array_agg(d.product_id ORDER BY d.created_at DESC) FILTER (WHERE d.product_id IS NOT NULL))[1] AS product_id,
    (array_agg(p.name ORDER BY d.created_at DESC) FILTER (WHERE p.name IS NOT NULL))[1]             AS producto,
    -- Stock is summed across inventories: the piece may be sitting elsewhere.
    (SELECT coalesce(sum(p2.quantity), 0)::int
       FROM public.products p2
      WHERE p2.id = (array_agg(d.product_id) FILTER (WHERE d.product_id IS NOT NULL))[1]) AS existencia,
    nullif(string_agg(DISTINCT c.nombre, ', ') FILTER (WHERE c.nombre IS NOT NULL AND NOT c.is_system), '') AS clientes,
    count(*) FILTER (WHERE d.contacto IS NOT NULL OR (c.id IS NOT NULL AND NOT c.is_system))::int  AS esperando,
    array_agg(d.id)                                                              AS ids
  FROM public.demanda_no_surtida d
  LEFT JOIN public.products  p ON p.id = d.product_id
  LEFT JOIN public.customers c ON c.id = d.customer_id
  WHERE d.estado IN ('abierto', 'pedido')
    AND d.created_at > now() - make_interval(days => greatest(1, p_dias))
  GROUP BY d.norm
  ORDER BY count(*) DESC, max(d.created_at) DESC;
$$;

REVOKE ALL ON FUNCTION public.demanda_agrupada(int) FROM public;
GRANT EXECUTE ON FUNCTION public.demanda_agrupada(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalizar_demanda(text) TO authenticated;
