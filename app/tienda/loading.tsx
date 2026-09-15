// Mirrors the catalog: the search, the quick-filter row, then model rows on a
// phone (68px photo, text, price) and a card grid beside the filter rail on
// desktop — same heights, so the swap to content does not jump (CLS).
export default function Loading() {
  return (
    <div aria-busy className="mx-auto max-w-6xl animate-pulse px-4 pb-28 sm:px-6 lg:pb-8">
      <div className="pt-3 lg:pt-6">
        <div className="h-12 rounded-xl bg-muted/50 lg:max-w-2xl" />
        <div className="mt-2 flex gap-2 overflow-hidden py-1 lg:hidden">
          <div className="h-11 w-24 shrink-0 rounded-full bg-muted/60" />
          <div className="h-11 w-24 shrink-0 rounded-full bg-muted/40" />
          <div className="h-11 w-20 shrink-0 rounded-full bg-muted/40" />
        </div>
      </div>

      <div className="mt-4 lg:grid lg:grid-cols-[240px_1fr] lg:gap-8">
        <div className="hidden space-y-2 lg:block">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="h-11 rounded-lg bg-muted/40" />
          ))}
        </div>
        <div className="min-w-0">
          <div className="flex h-11 items-center">
            <div className="h-4 w-28 rounded bg-muted/50" />
          </div>
          <div className="mt-1 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-background lg:mt-3 lg:grid lg:grid-cols-3 lg:gap-3 lg:divide-y-0 lg:rounded-none lg:border-0 lg:bg-transparent xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 lg:flex-col lg:items-stretch lg:rounded-2xl lg:border lg:border-border lg:bg-background lg:p-0">
                <div className="h-[68px] w-[68px] shrink-0 rounded-[10px] bg-muted/50 lg:aspect-[4/3] lg:h-auto lg:w-full lg:rounded-none" />
                <div className="flex-1 space-y-1.5 lg:p-3">
                  <div className="h-2.5 w-14 rounded bg-muted/50" />
                  <div className="h-4 w-32 rounded bg-muted/60" />
                  <div className="h-3 w-24 rounded bg-muted/40" />
                </div>
                <div className="h-5 w-14 rounded bg-muted/50 lg:mx-3 lg:mb-3" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
