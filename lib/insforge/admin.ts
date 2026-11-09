import "server-only";
import { createAdminClient } from "@insforge/sdk";
import { noStoreFetch } from "./fetch";
import { backendSupabase, enSupabase } from "./supabase";

// Full-access admin client. SERVER ONLY — bypasses RLS. Use sparingly,
// e.g. trusted RPC calls in Server Actions. Never import from client code.
export const insforgeAdmin = enSupabase
  ? (backendSupabase(process.env.SUPABASE_SERVICE_ROLE_KEY!) as unknown as ReturnType<typeof createAdminClient>)
  : createAdminClient({
      baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
      apiKey: process.env.INSFORGE_API_KEY!,
      fetch: noStoreFetch, // never read the database from Next's Data Cache
    });
