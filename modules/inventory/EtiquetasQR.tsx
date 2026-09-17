"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { renderSVG } from "uqr";
import { ArrowLeft, Printer } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { enlaceProducto } from "./qr";

export type ItemEtiqueta = { id: string; sku: string; name: string; price_cents: number };

type Formato = "hoja" | "rollo";

/**
 * Printable QR labels, 50 × 30 mm each. "Hoja": a letter sheet of 4 columns to
 * cut. "Rollo": one label per page, for a thermal label printer.
 */
export function EtiquetasQR({ items, recortado }: { items: ItemEtiqueta[]; recortado: number }) {
  const [formato, setFormato] = useState<Formato>("hoja");
  const [precio, setPrecio] = useState(true);
  // The QR carries this site's own address: known only in the browser.
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);

  return (
    <>
      <style>{`
        @page { ${formato === "rollo" ? "size: 50mm 30mm; margin: 0;" : "size: letter; margin: 8mm;"} }
        @media print { html, body { background: #fff !important; } }
      `}</style>

      <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
          <Link
            href="/inventario"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Inventario
          </Link>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {items.length} {items.length === 1 ? "etiqueta" : "etiquetas"}
            </p>
            {recortado > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Se imprimen las primeras {items.length}; filtra más para las {recortado} restantes.
              </p>
            )}
          </div>
          <div className="inline-flex rounded-lg bg-muted p-1 text-sm">
            {(
              [
                ["hoja", "Hoja carta"],
                ["rollo", "Rollo 50×30 mm"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFormato(k)}
                className={cn(
                  "h-8 cursor-pointer rounded-md px-3",
                  formato === k ? "bg-background font-medium shadow-sm" : "text-muted-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={precio} onChange={(e) => setPrecio(e.target.checked)} className="h-4 w-4" />
            Precio
          </label>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!origin || items.length === 0}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
        </div>
      </div>

      <div
        className={cn(
          "bg-white text-black",
          formato === "hoja"
            ? "mx-auto grid w-[200mm] grid-cols-4 content-start py-6 print:py-0"
            : "mx-auto flex w-[50mm] flex-col gap-4 py-6 print:gap-0 print:py-0",
        )}
      >
        {origin &&
          items.map((it) => (
            <div
              key={it.id}
              className={cn(
                "flex h-[30mm] w-[50mm] items-center gap-[2mm] overflow-hidden p-[2mm] break-inside-avoid",
                formato === "hoja"
                  ? "border border-dashed border-neutral-300"
                  : "border border-neutral-300 print:border-0 print:break-after-page",
              )}
            >
              <div
                className="h-[24mm] w-[24mm] shrink-0 [&>svg]:h-full [&>svg]:w-full"
                // uqr returns a self-contained <svg>, built from our own URL.
                dangerouslySetInnerHTML={{ __html: renderSVG(enlaceProducto(origin, it.id), { border: 2, ecc: "M" }) }}
              />
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-[1mm]">
                <p className="line-clamp-3 text-[8pt] font-semibold leading-tight">{it.name}</p>
                <p className="truncate font-mono text-[6.5pt] text-neutral-600">{it.sku}</p>
                {precio && <p className="text-[10pt] font-bold tabular-nums">{formatMXN(it.price_cents)}</p>}
              </div>
            </div>
          ))}
      </div>
    </>
  );
}
