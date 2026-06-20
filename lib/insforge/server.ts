import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@insforge/sdk";

// User-scoped InsForge client for Server Components / Server Actions.
// Authenticated with the caller's Clerk JWT (template "insforge"), so RLS and
// requesting_user_id() resolve to the real user. Returns an unauthenticated
// (anon) client if there is no session.
export async function createInsForgeServerClient() {
  const { getToken } = await auth();
  const token = await getToken({ template: "insforge" });

  const client = createClient({
    baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
    anonKey: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY!,
  });

  if (token) client.setAccessToken(token);
  return client;
}
