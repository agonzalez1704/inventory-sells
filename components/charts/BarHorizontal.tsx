import { max } from "d3-array";
import type { BarDatum } from "./BarVertical";

// Horizontal ranked bars (Rosen-style div bars), branded. Label · bar · value.
export function BarHorizontal({
  data,
  format = (n) => String(n),
}: {
  data: BarDatum[];
  format?: (n: number) => string;
}) {
  const xMax = max(data, (d) => d.value) ?? 0;

  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <div
            className="w-32 shrink-0 truncate text-xs text-muted-foreground"
            title={d.key}
          >
            {d.key}
          </div>
          <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-muted/60">
            <div
              className="absolute inset-y-0 left-0 rounded-md bg-gradient-to-r from-brand to-brand-strong"
              style={{ width: `${Math.max(2, (d.value / (xMax || 1)) * 100)}%` }}
            />
          </div>
          <div className="w-20 shrink-0 text-right font-mono text-xs tabular-nums">
            {format(d.value)}
          </div>
        </div>
      ))}
    </div>
  );
}
