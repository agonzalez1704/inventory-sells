import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@insforge/sdk";
import { noStoreFetch } from "./fetch";
import { backendSupabase, enSupabase } from "./supabase";

// User-scoped client for Server Components / Server Actions. Authenticated with
// the caller's Clerk JWT, so RLS and requesting_user_id() resolve to the real
// user. Returns an unauthenticated (anon) client if there is no session.
export async function createInsForgeServerClient() {
  const { getToken } = await auth();
  const token = await getToken({ template: enSupabase ? "supabase" : "insforge" });

  if (enSupabase) {
    return backendSupabase(process.env.SUPABASE_ANON_KEY!, token) as unknown as ReturnType<typeof createClient>;
  }

  const client = createClient({
    baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
    anonKey: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY!,
    fetch: noStoreFetch, // never read the database from Next's Data Cache
  });

  if (token) client.setAccessToken(token);
  return client;
}
