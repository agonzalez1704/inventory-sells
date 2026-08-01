import "server-only";
import { createAdminClient } from "@insforge/sdk";
import { noStoreFetch } from "./fetch";

// Full-access admin client. SERVER ONLY — bypasses RLS. Use sparingly,
// e.g. trusted RPC calls in Server Actions. Never import from client code.
export const insforgeAdmin = createAdminClient({
  baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
  apiKey: process.env.INSFORGE_API_KEY!,
  fetch: noStoreFetch, // never read the database from Next's Data Cache
});
