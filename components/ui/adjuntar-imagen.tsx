"use client";

import { useRef } from "react";
import { toast } from "sonner";
import { ClipboardPaste, ImageUp, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Image attachment built for how proofs actually arrive: by WhatsApp. The
 * seller copies the screenshot there and PASTES it here — the "Pegar" button
 * reads the clipboard directly (Async Clipboard API, works on iOS/Android
 * long-press flows too), and the whole block also accepts a paste event for
 * desktop Ctrl+V. Picking a file stays available as the fallback.
 */
export function AdjuntarImagen({
  value,
  onChange,
  className,
}: {
  value: File | null;
  onChange: (f: File | null) => void;
  className?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  function desdeItems(items: DataTransferItemList | null): boolean {
    for (const item of Array.from(items ?? [])) {
      if (item.type.startsWith("image/")) {
        const f = item.getAsFile();
        if (f) {
          onChange(f);
          return true;
        }
      }
    }
    return false;
  }

  async function pegar() {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const tipo = item.types.find((t) => t.startsWith("image/"));
        if (tipo) {
          const blob = await item.getType(tipo);
          onChange(new File([blob], `captura.${tipo.split("/")[1] ?? "png"}`, { type: tipo }));
          return;
        }
      }
      toast.error("No hay imagen en el portapapeles — copia la captura primero");
    } catch {
      toast.error(
        "No se pudo leer el portapapeles. Mantén presionado el campo y elige Pegar, o adjunta el archivo.",
      );
    }
  }

  return (
    <div
      onPaste={(e) => {
        if (desdeItems(e.clipboardData?.items ?? null)) e.preventDefault();
      }}
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      <button
        type="button"
        onClick={pegar}
        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium transition-colors hover:border-ring/40 active:scale-[0.97]"
      >
        <ClipboardPaste className="h-4 w-4" />
        Pegar captura
      </button>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium transition-colors hover:border-ring/40 active:scale-[0.97]"
      >
        <ImageUp className="h-4 w-4" />
        Archivo
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onChange(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      {value && (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          ✓ {value.name.length > 24 ? `${value.name.slice(0, 24)}…` : value.name}
          <button
            type="button"
            aria-label="Quitar imagen"
            onClick={() => onChange(null)}
            className="cursor-pointer rounded-full p-0.5 hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      )}
    </div>
  );
}
