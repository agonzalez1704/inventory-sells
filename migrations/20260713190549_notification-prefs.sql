-- Per-user choice of which events trigger a push notification. Missing row =
-- defaults (venta + fiado on, abono + cancelación off). One row per user.
CREATE TABLE public.notification_prefs (
  user_id     text PRIMARY KEY DEFAULT public.requesting_user_id(),
  venta       boolean NOT NULL DEFAULT true,
  fiado       boolean NOT NULL DEFAULT true,
  abono       boolean NOT NULL DEFAULT false,
  cancelacion boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own read notification_prefs"
  ON public.notification_prefs FOR SELECT TO authenticated
  USING (user_id = public.requesting_user_id());
CREATE POLICY "own insert notification_prefs"
  ON public.notification_prefs FOR INSERT TO authenticated
  WITH CHECK (user_id = public.requesting_user_id());
CREATE POLICY "own update notification_prefs"
  ON public.notification_prefs FOR UPDATE TO authenticated
  USING (user_id = public.requesting_user_id())
  WITH CHECK (user_id = public.requesting_user_id());

GRANT SELECT, INSERT, UPDATE ON public.notification_prefs TO authenticated;
