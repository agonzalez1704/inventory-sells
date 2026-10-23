-- Each user may pick one saved dashboard as their home: opening the app (or
-- the logo) lands there instead of the default screen. Deleting the dashboard
-- just clears the choice.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS inicio_dashboard_id uuid REFERENCES public.dashboards(id) ON DELETE SET NULL;
