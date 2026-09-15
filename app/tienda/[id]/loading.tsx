// Mirrors ModeloCompra: back link, full-bleed photo on phones, title, three
// quality rows and the fixed buy bar — so the swap to content does not jump.
export default function Loading() {
  return (
    <div aria-busy className="mx-auto max-w-6xl animate-pulse px-4 pb-32 pt-1 sm:px-6 lg:pb-12 lg:pt-6">
      <div className="flex h-11 items-center">
        <div className="h-4 w-20 rounded bg-muted/50" />
      </div>
      <div className="lg:grid lg:grid-cols-2 lg:gap-10">
        <div className="-mx-4 aspect-[4/3] bg-muted/40 sm:mx-0 sm:aspect-square sm:rounded-3xl" />
        <div className="pt-4 lg:pt-0">
          <div className="h-3 w-36 rounded bg-muted/50" />
          <div className="mt-2 h-7 w-52 rounded-lg bg-muted/60" />
          <div className="mt-5 h-4 w-32 rounded bg-muted/50" />
          <div className="mt-2 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-muted/40" />
            ))}
          </div>
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 flex gap-2.5 border-t border-border bg-background px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden">
        <div className="h-14 w-14 rounded-2xl bg-muted/40" />
        <div className="h-14 flex-1 rounded-2xl bg-muted/50" />
      </div>
    </div>
  );
}
