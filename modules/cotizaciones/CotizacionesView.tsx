"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Plus, User } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export type CotizacionRow = {
  id: string;
  folio: string;
  cliente: string;
  vendedor: string | null;
  estado: string;
  canal: string;
  total_cents: number;
  created_at: string;
  expires_at: string | null;
  esPropia: boolean;
  sinAsignar: boolean;
};

type Tone = "neutral" | "success" | "warning" | "danger" | "accent";

// A pendiente quote past its vigencia reads as "vencida" (a soft/derived state —
// the row stays pendiente in the DB; only conversion or cancel are terminal).
function estadoDe(c: CotizacionRow): { label: string; tone: Tone } {
  if (c.estado === "pendiente" && c.expires_at && new Date(c.expires_at) < new Date())
    return { label: "Vencida", tone: "danger" };
  switch (c.estado) {
    case "borrador":
      return { label: "Borrador", tone: "neutral" };
    case "pendiente":
      return { label: "Pendiente", tone: "warning" };
    case "autorizada":
      return { label: "Autorizada", tone: "accent" };
    case "convertida":
      return { label: "Convertida", tone: "success" };
    case "cancelada":
      return { label: "Cancelada", tone: "neutral" };
    default:
      return { label: c.estado, tone: "neutral" };
  }
}

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

const FILTROS = ["todas", "sin asignar", "pendiente", "autorizada", "convertida", "borrador", "cancelada"] as const;
type Filtro = (typeof FILTROS)[number];

export function CotizacionesView({ cotizaciones }: { cotizaciones: CotizacionRow[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todas");

  const conteos = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cotizaciones) m.set(c.estado, (m.get(c.estado) ?? 0) + 1);
    return m;
  }, [cotizaciones]);

  const activa = (c: CotizacionRow) => c.estado !== "convertida" && c.estado !== "cancelada";
  const sinAsignarCount = cotizaciones.filter((c) => c.sinAsignar && activa(c)).length;
  const rows =
    filtro === "todas"
      ? cotizaciones
      : filtro === "sin asignar"
        ? cotizaciones.filter((c) => c.sinAsignar && activa(c))
        : cotizaciones.filter((c) => c.estado === filtro);

  return (
    <section className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cotizaciones</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Arma, envía y autoriza cotizaciones. Al entregar se convierten en venta.
          </p>
        </div>
        <Button asChild variant="accent">
          <Link href="/cotizaciones/nueva">
            <Plus className="h-4 w-4" /> Nueva
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => {
          const n =
            f === "todas"
              ? cotizaciones.length
              : f === "sin asignar"
                ? sinAsignarCount
                : conteos.get(f) ?? 0;
          return (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={cn(
                "cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium capitalize transition-colors",
                filtro === f
                  ? "bg-accent text-white shadow-sm shadow-accent/25"
                  : "border border-border bg-background text-muted-foreground hover:border-ring/40 hover:text-foreground",
              )}
            >
              {f} {n > 0 && <span className="tabular-nums opacity-70">· {n}</span>}
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Sin cotizaciones"
          description="Crea la primera con el botón «Nueva»."
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-background">
          {rows.map((c) => {
            const est = estadoDe(c);
            return (
              <li key={c.id}>
                <Link
                  href={`/cotizaciones/${c.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{c.folio}</span>
                      <Badge tone={est.tone}>{est.label}</Badge>
                      {c.sinAsignar && activa(c) && <Badge tone="accent">Sin asignar</Badge>}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {c.cliente}
                      {c.vendedor && (
                        <span className="ml-2 inline-flex items-center gap-1">
                          <User className="h-3 w-3" /> {c.vendedor}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-sm font-semibold tabular-nums">{formatMXN(c.total_cents)}</p>
                    <p className="text-xs text-muted-foreground">{fechaCorta(c.created_at)}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
