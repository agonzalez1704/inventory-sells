-- R8: conversational WhatsApp quotes. The agent accumulates the customer's
-- items in a per-number draft order and only creates the cotización when the
-- customer confirms nothing else is missing ("es todo"). Tool results aren't
-- part of the persisted chat history, so the draft (with exact SKUs) must
-- live in the DB, not in the model's context.
--
-- One draft per number, upserted; drafts older than the 6h conversation
-- window are treated as stale by the app. Same posture as wa_mensajes:
-- webhook writes via the admin client, staff may read.
CREATE TABLE public.wa_pedidos (
  numero     TEXT PRIMARY KEY,
  items      JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{sku, nombre, qty, unit_mxn}]
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.wa_pedidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read wa_pedidos"
  ON public.wa_pedidos FOR SELECT TO authenticated
  USING (public.requesting_user_id() IS NOT NULL);

GRANT SELECT ON public.wa_pedidos TO authenticated;
