"use client";

import { useState } from "react";
import { Smartphone } from "lucide-react";
import { foto } from "@/lib/foto";
import { cn } from "@/lib/utils";

/**
 * The product page's photo block: one big view, thumbnails when the supplier
 * shipped more than one angle. With a single photo it renders exactly what the
 * old static block did — no thumbs, no extra chrome.
 */
export function GaleriaFotos({ imagenes, alt }: { imagenes: string[]; alt: string }) {
  const [sel, setSel] = useState(0);
  const actual = imagenes[sel] ?? imagenes[0];

  return (
    <div>
      {/* Phone: edge to edge and shorter (4:3), so the quality choice is
          still on the first screen. */}
      <div className="flex aspect-4/3 items-center justify-center overflow-hidden border-y border-border bg-background sm:aspect-square sm:rounded-3xl sm:border">
        {actual ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={foto(actual, 828)}
            alt={alt}
            className="h-full w-full object-contain p-4"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-tienda-50 to-slate-50 text-tienda-300">
            <Smartphone className="h-24 w-24" />
          </div>
        )}
      </div>
      {imagenes.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {imagenes.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setSel(i)}
              aria-label={`Vista ${i + 1}`}
              className={cn(
                "h-16 w-16 shrink-0 overflow-hidden rounded-xl border bg-background",
                i === sel
                  ? "border-tienda-500 ring-1 ring-tienda-500/40"
                  : "border-tienda-100 dark:border-tienda-900",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto(url, 128)} alt="" className="h-full w-full object-contain p-1" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
