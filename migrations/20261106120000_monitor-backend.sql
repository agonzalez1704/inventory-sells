-- Uptime watch for the InsForge backends, run by the Vercel cron
-- /api/cron/vigilar. One row per watched host: when it went down and when the
-- owner was last told, so an outage alerts once (then hourly) and the
-- recovery alerts once — not every five minutes.
CREATE TABLE IF NOT EXISTS public.monitor_backend (
  host         text PRIMARY KEY,
  nombre       text NOT NULL,
  caido_desde  timestamptz,
  avisado_at   timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
