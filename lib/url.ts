/**
 * The site's own origin, for links that leave the app: sitemap entries, robots.
 *
 * Deliberately NOT read from the request headers. Reading them marks the route
 * dynamic, and a dynamic sitemap is re-generated on every crawler fetch — which
 * would mean reading the id of every product each time, a smaller copy of the
 * problem the sitemap was added to solve.
 */
export function urlBase(): string {
  const explicita = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (explicita) return explicita;
  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}
