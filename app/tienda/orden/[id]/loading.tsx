export default function Loading() {
  return (
    <div aria-busy className="mx-auto max-w-2xl animate-pulse space-y-4 px-3 py-10">
      <div className="h-8 w-64 rounded-lg bg-muted/60" />
      <div className="h-40 rounded-2xl bg-muted/40" />
      <div className="h-24 rounded-2xl bg-muted/40" />
    </div>
  );
}
