"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CategoriaConteo } from "@/modules/inventory/buscar";

// The long tail of categories, searchable.
//
// Ruli has 216 of them and they are opaque five-letter ERP codes — GSAMO,
// VIPLA, YSBOM. Nobody scans that list looking for a word they recognise, so
// the count is what makes a row legible: it says how much of the shop is behind
// it. Sorted by count for the same reason.
export function CategoriaSheet({
  categorias,
  activa,
  onPick,
  onClose,
}: {
  categorias: CategoriaConteo[];
  activa: string | null;
  onPick: (c: string | null) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    const orden = [...categorias].sort(
      (a, b) => b.productos - a.productos || a.categoria.localeCompare(b.categoria, "es"),
    );
    return t ? orden.filter((c) => c.categoria.toLowerCase().includes(t)) : orden;
  }, [categorias, q]);

  return (
    <Modal open onClose={onClose} title="Categorías">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Buscar entre ${categorias.length} categorías`}
          className="pl-9"
        />
      </div>

      {/* Capped height so the sheet never grows past the screen — the bug this
          replaces was a list with no ceiling. */}
      <div className="mt-3 max-h-[55vh] overflow-y-auto rounded-xl border border-border">
        <button
          onClick={() => {
            onPick(null);
            onClose();
          }}
          className={cn(
            "flex w-full cursor-pointer items-center justify-between gap-3 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
            activa === null && "bg-muted font-medium",
          )}
        >
          <span className="text-sm">Todas</span>
        </button>

        {lista.map((c) => (
          <button
            key={c.categoria}
            onClick={() => {
              onPick(c.categoria);
              onClose();
            }}
            className={cn(
              "flex w-full cursor-pointer items-center justify-between gap-3 border-b border-border px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-muted/60",
              activa === c.categoria && "bg-muted font-medium",
            )}
          >
            <span className="truncate text-sm capitalize">{c.categoria}</span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              {c.productos}
            </span>
          </button>
        ))}

        {lista.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Ninguna categoría coincide con “{q}”.
          </p>
        )}
      </div>
    </Modal>
  );
}
