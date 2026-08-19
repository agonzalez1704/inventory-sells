export default function Loading() {
  return (
    <div aria-busy className="mx-auto max-w-5xl animate-pulse px-3 py-6 sm:px-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="aspect-square rounded-2xl bg-muted/40" />
        <div className="space-y-3">
          <div className="h-8 w-3/4 rounded-lg bg-muted/60" />
          <div className="h-5 w-32 rounded bg-muted/50" />
          <div className="h-12 w-full rounded-xl bg-muted/40" />
        </div>
      </div>
    </div>
  );
}
