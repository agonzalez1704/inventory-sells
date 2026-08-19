// Mirrors the real grid — the sidebar, the search bar, and h-52 cards in the
// same columns — so the swap to content does not jump (CLS), which is the
// whole point of a skeleton on the page that sells.
export default function Loading() {
  return (
    <div aria-busy className="mx-auto max-w-6xl animate-pulse px-3 py-6 sm:px-6">
      <div className="h-40 rounded-2xl bg-muted/40" />
      <div className="mt-6 flex gap-5">
        <div className="hidden w-56 shrink-0 space-y-2 lg:block">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-8 rounded-full bg-muted/40" />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="h-11 rounded-xl bg-muted/50" />
          <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-52 rounded-2xl bg-muted/40" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
