"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, FileDown, MessageCircleQuestion, PackageSearch, Truck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MARCA } from "@/lib/marca";
import { pdfDemanda } from "@/lib/demanda-pdf";
import { cerrarDemanda, type DemandaAgrupada } from "./actions";

const TZ = "America/Mexico_City";
const cuando = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

const TIPO_LABEL: Record<string, string> = {
  pantalla: "Pantalla",
  bateria: "Batería",
  tapa: "Tapa",
  flex: "Flex",
  otro: "Otro",
};

/**
 * What the counter could not sell, grouped by model: the buyer's own list.
 *
 * A row leaves when the piece arrives ("ya llegó") or when someone decides it
 * is not worth carrying ("no lo vamos a traer"); marking it ordered keeps it
 * visible but stops it from inflating the next restock.
 */
export function DemandaTab({ lista, dias, onDias }: { lista: DemandaAgrupada[]; dias: number; onDias: (d: number) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [soloNuevos, setSoloNuevos] = useState(false);

  const filas = useMemo(
    () => (soloNuevos ? lista.filter((d) => !d.product_id) : lista),
    [lista, soloNuevos],
  );
  const piezas = lista.reduce((s, d) => s + d.piezas, 0);
  const esperando = lista.reduce((s, d) => s + d.esperando, 0);

  function mover(d: DemandaAgrupada, estado: "pedido" | "surtido" | "descartado") {
    start(async () => {
      const r = await cerrarDemanda(d.ids, estado);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        estado === "pedido"
          ? `${d.texto} marcado como pedido`
          : estado === "surtido"
            ? `${d.texto} ya llegó · sale de la lista`
            : `${d.texto} descartado`,
      );
      router.refresh();
    });
  }

  if (lista.length === 0)
    return (
      <EmptyState
        icon={PackageSearch}
        title="Nadie ha pedido algo que no tengas"
        description="Cuando una búsqueda en el punto de venta no encuentre nada, el vendedor lo anota aquí."
      />
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {([30, 90] as const).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={dias === d}
            onClick={() => onDias(d)}
            className={cn(
              "inline-flex h-10 cursor-pointer items-center rounded-full border px-4 text-sm",
              dias === d ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
            )}
          >
            Últimos {d} días
          </button>
        ))}
        <button
          type="button"
          aria-pressed={soloNuevos}
          onClick={() => setSoloNuevos((v) => !v)}
          className={cn(
            "inline-flex h-10 cursor-pointer items-center rounded-full border px-4 text-sm",
            soloNuevos ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
          )}
        >
          Solo lo que no existe en catálogo
        </button>
        {/* Lo que está en pantalla es lo que sale en el PDF: el filtro de días
            y el de catálogo ya son la decisión del comprador. */}
        <Button
          variant="secondary"
          className="ml-auto h-10"
          disabled={filas.length === 0}
          onClick={() => pdfDemanda(filas, dias, MARCA.tienda.nombre).catch(() => toast.error("No se pudo generar el PDF"))}
        >
          <FileDown className="h-4 w-4" />
          PDF
        </Button>
        <span className="text-sm text-muted-foreground">
          {piezas} {piezas === 1 ? "pieza pedida" : "piezas pedidas"}
          {esperando > 0 && ` · ${esperando} ${esperando === 1 ? "cliente espera" : "clientes esperan"}`}
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-background">
        {filas.map((d) => {
          const nuevo = !d.product_id;
          const enCeros = !!d.product_id && (d.existencia ?? 0) === 0;
          return (
            <div key={d.norm} className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border/70 p-3.5 last:border-b-0 sm:p-4">
              <div className="min-w-48 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{d.producto ?? d.texto}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {TIPO_LABEL[d.tipo] ?? d.tipo}
                  </span>
                  {nuevo ? (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                      No existe en el catálogo
                    </span>
                  ) : enCeros ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                      Existe · en ceros
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      Ya hay {d.existencia} en piso
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                  Última vez {cuando(d.ultima)}
                  {d.clientes && ` · ${d.clientes}`}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-[11px] text-muted-foreground">Veces</p>
                <p className="text-xl font-bold tabular-nums">{d.veces}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[11px] text-muted-foreground">Piezas</p>
                <p className="text-xl font-bold tabular-nums">{d.piezas}</p>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <Button variant="secondary" className="h-10" disabled={pending} onClick={() => mover(d, "pedido")}>
                  <Truck className="h-4 w-4" />
                  Ya lo pedí
                </Button>
                <Button variant="secondary" className="h-10" disabled={pending} onClick={() => mover(d, "surtido")}>
                  <Check className="h-4 w-4" />
                  Ya llegó
                </Button>
                {nuevo ? (
                  <Button variant="secondary" className="h-10" asChild>
                    <Link href="/inventario">Dar de alta</Link>
                  </Button>
                ) : (
                  <Button variant="secondary" className="h-10" asChild>
                    <Link href={`/inventario?p=${d.product_id}`}>Ver pieza</Link>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="h-10 w-10 px-0"
                  aria-label={`Descartar ${d.texto}`}
                  disabled={pending}
                  onClick={() => mover(d, "descartado")}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="flex items-start gap-2 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
        <MessageCircleQuestion className="mt-0.5 h-4 w-4 shrink-0" />
        Cada pieza pedida cuenta como una venta que se perdió: entra al resurtido igual que una venta real, hasta que
        marques que llegó o que no la vas a traer.
      </p>
    </div>
  );
}
