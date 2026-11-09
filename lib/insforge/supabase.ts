import "server-only";
import { createClient } from "@supabase/supabase-js";
import { cubetaCompat, type SupabaseBucket } from "./compat";
import { noStoreFetch } from "./fetch";

// Each deployment has its own database. Where SUPABASE_URL is set the app talks
// to Supabase through the same { database, storage } shape as the InsForge SDK
// (whose database client is postgrest-js too), so no query had to change.
export const enSupabase = Boolean(process.env.SUPABASE_URL);

export function backendSupabase(key: string, accessToken?: string | null) {
  const client = createClient(process.env.SUPABASE_URL!, key, {
    global: { fetch: noStoreFetch }, // never read the database from Next's Data Cache
    // Clerk issues the session; with no token the anon key is sent instead.
    ...(accessToken === undefined
      ? { auth: { persistSession: false, autoRefreshToken: false } }
      : { accessToken: async () => accessToken }),
  });
  return {
    database: client,
    storage: {
      from: (bucket: string) => cubetaCompat(client.storage.from(bucket) as unknown as SupabaseBucket),
    },
  };
}
