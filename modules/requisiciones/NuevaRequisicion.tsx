"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, Trash2, PackageX, Copy } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { unwrap } from "@/lib/errors";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import {
  generarRequisicion,
  revisarConIA,
  guardarRequisicion,
  type Inventario,
  type LineaRequisicion,
} from "./actions";

/** A proposed line plus the quantity the buyer actually wants. */
type Linea = LineaRequisicion & { qty: number };

const TONO_FUENTE = {
  agotado: "warning",
  minimo: "accent",
  ritmo: "neutral",
  ia: "accent",
} as const;

const ETIQUETA_FUENTE = {
  agotado: "Agotada",
  minimo: "Bajo mínimo",
  ritmo: "Por ritmo",
  ia: "Criterio IA",
} as const;

export function NuevaRequisicion({ inventarios }: { inventarios: Inventario[] }) {
  const router = useRouter();
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [cobertura, setCobertura] = useState(3);
  // What the buyer is asking for, kept apart from what was proposed. Editing
  // in place would erase the suggestion, and "pidió 10, el sistema decía 3" is
  // the only way to tell later whether the formula is wrong or the buyer knew
  // something it did not.
  const [lineas, setLineas] = useState<Linea[] | null>(null);
  const [sustitutos, setSustitutos] = useState<{ skus: string[]; motivo: string }[]>([]);
  const [descartadas, setDescartadas] = useState<{ sku: string; nombre: string; motivo: string }[]>([]);
  const [notas, setNotas] = useState("");
  const [generando, gen] = useTransition();
  const [revisando, rev] = useTransition();
  const [guardando, save] = useTransition();

  function generar() {
    if (elegidos.length === 0) return toast.error("Elige al menos un inventario");
    gen(async () => {
      try {
        const l = unwrap(await generarRequisicion(elegidos, cobertura));
        setLineas(l.map((x) => ({ ...x, qty: x.sugerido })));
        setSustitutos([]);
        setDescartadas([]);
        if (l.length === 0) toast.success("Nada por pedir: todo está sobre su nivel.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo generar");
      }
    });
  }

  function revisar() {
    if (!lineas?.length) return;
    rev(async () => {
      try {
        const r = unwrap(await revisarConIA(lineas));
        // The model's number IS the proposal for those lines, so both move.
        setLineas(r.lineas.map((x) => ({ ...x, qty: x.sugerido })));
        setSustitutos(r.sustitutos);
        setDescartadas(r.descartadas);
        toast.success("Revisión aplicada", {
          description: `${r.descartadas.length} descartadas · ${r.sustitutos.length} posibles duplicados`,
        });
      } catch (e) {
        // The document survives a model failure — that is why this is a
        // separate step.
        toast.error(e instanceof Error ? e.message : "No se pudo revisar", {
          description: "La requisición calculada sigue intacta.",
        });
      }
    });
  }

  function guardar() {
    if (!lineas?.length) return;
    save(async () => {
      try {
        unwrap(
          await guardarRequisicion(
            elegidos,
            cobertura,
            lineas.map((l) => ({
              product_id: l.product_id,
              qty: l.qty,
              sugerido: l.sugerido,
              existencia: l.existencia,
              ritmo_semanal: l.ritmo_semanal,
              fuente: l.fuente,
              motivo: l.motivo,
            })),
            notas || null,
          ),
        );
        toast.success("Requisición guardada");
        setLineas(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo guardar");
      }
    });
  }

  const piezas = lineas?.reduce((s, l) => s + l.qty, 0) ?? 0;
  // Only when every line carries a cost — a partial total is a wrong total, and
  // whoever cannot see costs gets no number rather than half of one.
  const costo =
    lineas?.every((l) => l.costo_cents !== null)
      ? lineas.reduce((s, l) => s + (l.costo_cents ?? 0) * l.qty, 0)
      : null;
  const enDuplicado = new Set(sustitutos.flatMap((g) => g.skus));

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-sm font-semibold">¿Qué inventarios?</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {inventarios.map((i) => {
            const on = elegidos.includes(i.id);
            return (
              <button
                key={i.id}
                type="button"
                onClick={() =>
                  setElegidos((p) => (on ? p.filter((x) => x !== i.id) : [...p, i.id]))
                }
                className={cn(
                  "cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors",
                  on ? "border-ring bg-brand-soft text-brand-foreground" : "border-border hover:border-ring/40",
                )}
              >
                {i.name}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Semanas de cobertura
            </span>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={26}
              value={cobertura}
              onChange={(e) =>
                setCobertura(Math.max(1, Math.min(Number(e.target.value) || 1, 26)))
              }
              className="w-28"
            />
          </label>
          <Button onClick={generar} loading={generando}>
            Generar
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Cuánto tiempo debe aguantar el pedido. Las cantidades salen del ritmo
          de venta de las últimas 8 semanas más el tiempo de entrega del
          proveedor.
        </p>
      </Card>

      {lineas && lineas.length === 0 && (
        <EmptyState
          icon={PackageX}
          title="Nada por pedir"
          description="Todo lo de esos inventarios está sobre su nivel."
        />
      )}

      {lineas && lineas.length > 0 && (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-semibold">
                {lineas.length} piezas distintas · {piezas} unidades
              </p>
              {costo !== null && (
                <p className="text-xs text-muted-foreground">
                  Costo estimado {formatMXN(costo)}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={revisar} loading={revisando}>
                <Sparkles className="h-4 w-4" />
                Revisar con IA
              </Button>
              <Button onClick={guardar} loading={guardando}>
                Guardar
              </Button>
            </div>
          </Card>

          {descartadas.length > 0 && (
            <Card className="p-4">
              <h3 className="text-sm font-semibold">
                Descartadas por la revisión ({descartadas.length})
              </h3>
              <ul className="mt-2 space-y-1">
                {descartadas.map((d) => (
                  <li key={d.sku} className="text-xs text-muted-foreground">
                    <span className="font-mono uppercase">{d.sku}</span> · {d.motivo}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {sustitutos.length > 0 && (
            <Card className="p-4">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <Copy className="h-4 w-4" />
                Posible pedido doble ({sustitutos.length})
              </h3>
              {/* Flagged, never merged: two qualities of the same screen is
                  sometimes exactly what the shop wants to stock. */}
              <p className="mt-1 text-xs text-muted-foreground">
                Resuelven la misma reparación. Quita la que no quieras.
              </p>
              <ul className="mt-2 space-y-1.5">
                {sustitutos.map((g, i) => (
                  <li key={i} className="text-xs">
                    <span className="font-mono uppercase">{g.skus.join(" · ")}</span>
                    <span className="text-muted-foreground"> — {g.motivo}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="space-y-2">
            {lineas.map((l) => (
              <Card
                key={l.product_id}
                className={cn("p-3", enDuplicado.has(l.sku) && "ring-1 ring-amber-400/60")}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs uppercase text-muted-foreground">
                        {l.sku}
                      </span>
                      <Badge tone={TONO_FUENTE[l.fuente]}>{ETIQUETA_FUENTE[l.fuente]}</Badge>
                    </div>
                    <p className="mt-0.5 text-sm font-medium">{l.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.motivo}
                      {l.proveedor ? ` · ${l.proveedor}` : ""}
                      {l.qty !== l.sugerido ? ` · sugería ${l.sugerido}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <label className="text-right">
                      <span className="mb-1 block text-[10px] uppercase text-muted-foreground">
                        Pedir
                      </span>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={l.qty}
                        onChange={(e) => {
                          const q = Math.max(0, Number(e.target.value) || 0);
                          setLineas((p) =>
                            (p ?? []).map((x) =>
                              x.product_id === l.product_id ? { ...x, qty: q } : x,
                            ),
                          );
                        }}
                        className="w-20 text-right"
                      />
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Quitar ${l.sku}`}
                      onClick={() =>
                        setLineas((p) => (p ?? []).filter((x) => x.product_id !== l.product_id))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <Card className="p-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Notas
              </span>
              <Input
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Para el pedido del lunes…"
              />
            </label>
          </Card>
        </>
      )}
    </div>
  );
}
