// The implicit Suspense for every staff route (nextjs-app-like.md step 6).
// Without it, a navigation waits for auth + data with the old screen frozen —
// with it, the prerendered shell paints this instantly and the page streams in.
export default function Loading() {
  return (
    <div aria-busy className="animate-pulse space-y-4">
      <div className="h-8 w-56 rounded-lg bg-muted/60" />
      <div className="h-4 w-80 rounded bg-muted/50" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-32 rounded-2xl bg-muted/40" />
        ))}
      </div>
    </div>
  );
}
