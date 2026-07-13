-- Web Push subscriptions for admin notifications (a new sale / fiado). One row
-- per device/browser; the sender (admin client, server-side) reads them all and
-- pushes via VAPID. Users manage only their own subscriptions.
CREATE TABLE public.push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text NOT NULL DEFAULT public.requesting_user_id(),
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_subscriptions_user_idx ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own read push_subscriptions"
  ON public.push_subscriptions FOR SELECT TO authenticated
  USING (user_id = public.requesting_user_id());
CREATE POLICY "own insert push_subscriptions"
  ON public.push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = public.requesting_user_id());
CREATE POLICY "own update push_subscriptions"
  ON public.push_subscriptions FOR UPDATE TO authenticated
  USING (user_id = public.requesting_user_id())
  WITH CHECK (user_id = public.requesting_user_id());
CREATE POLICY "own delete push_subscriptions"
  ON public.push_subscriptions FOR DELETE TO authenticated
  USING (user_id = public.requesting_user_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
