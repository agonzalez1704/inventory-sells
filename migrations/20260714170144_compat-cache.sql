-- Cache of the AI's "which models share this part" answers, keyed by the
-- normalized query. The storefront is public, so a zero-result search must not
-- be able to hammer the model — the second identical search is free.
CREATE TABLE public.compat_cache (
  query      text PRIMARY KEY,
  modelos    jsonb NOT NULL DEFAULT '[]'::jsonb,
  nota       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.compat_cache ENABLE ROW LEVEL SECURITY;
-- No policies: read/written server-side with the admin client only.
