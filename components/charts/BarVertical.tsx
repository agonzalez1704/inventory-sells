import type { CSSProperties } from "react";
import { scaleBand, scaleLinear } from "d3-scale";
import { max } from "d3-array";

// Vertical bar chart in the Rosen Charts style (div bars + D3 scales),
// branded with the Fiable gold→amber gradient. RSC-friendly.
export type BarDatum = { key: string; value: number };

export function BarVertical({
  data,
  format = (n) => String(n),
}: {
  data: BarDatum[];
  format?: (n: number) => string;
}) {
  const xScale = scaleBand()
    .domain(data.map((d) => d.key))
    .range([0, 100])
    .padding(0.35);

  const yMax = max(data, (d) => d.value) ?? 0;
  const yScale = scaleLinear()
    .domain([0, yMax || 1])
    .range([100, 0]);

  return (
    <div
      className="relative h-56 w-full"
      style={{ "--mb": "26px" } as CSSProperties}
    >
      <div className="absolute inset-0 h-[calc(100%-var(--mb))] overflow-visible">
        {/* Grid lines */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-full w-full overflow-visible text-border"
        >
          {yScale.ticks(4).map((t, i) => (
            <line
              key={i}
              x1={0}
              x2={100}
              y1={yScale(t)}
              y2={yScale(t)}
              stroke="currentColor"
              strokeDasharray="4,4"
              strokeWidth={0.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {/* Bars */}
        {data.map((d, i) => {
          const h = yScale(0) - yScale(d.value);
          return (
            <div
              key={i}
              title={`${d.key}: ${format(d.value)}`}
              style={{
                width: `${xScale.bandwidth()}%`,
                height: `${h}%`,
                marginLeft: `${xScale(d.key) ?? 0}%`,
                borderRadius: "5px 5px 0 0",
              }}
              className="absolute bottom-0 bg-gradient-to-t from-brand to-brand-strong transition-opacity hover:opacity-90"
            />
          );
        })}

        {/* X labels */}
        {data.map((d, i) => (
          <div
            key={i}
            className="absolute top-full mt-1.5 -translate-x-1/2 text-[10px] capitalize text-muted-foreground"
            style={{ left: `${(xScale(d.key) ?? 0) + xScale.bandwidth() / 2}%` }}
          >
            {d.key}
          </div>
        ))}
      </div>
    </div>
  );
}
