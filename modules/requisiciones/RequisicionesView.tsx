"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardList, Plus } from "lucide-react";
import { unwrap } from "@/lib/errors";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NuevaRequisicion } from "./NuevaRequisicion";
import { cambiarEstado, type Inventario, type RequisicionGuardada } from "./actions";

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });

const TONO = { borrador: "neutral", enviada: "accent", cerrada: "neutral" } as const;
const ETIQUETA = { borrador: "Borrador", enviada: "Enviada", cerrada: "Cerrada" } as const;

export function RequisicionesView({
  inventarios,
  requisiciones,
}: {
  inventarios: Inventario[];
  requisiciones: RequisicionGuardada[];
}) {
  const [nueva, setNueva] = useState(requisiciones.length === 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Requisiciones</h1>
          <p className="text-xs text-muted-foreground">
            Qué hay que pedir, por nivel de existencias.
          </p>
        </div>
        {!nueva && (
          <Button onClick={() => setNueva(true)}>
            <Plus className="h-4 w-4" />
            Nueva
          </Button>
        )}
      </div>

      {nueva && <NuevaRequisicion inventarios={inventarios} />}

      {requisiciones.length === 0 && !nueva ? (
        <EmptyState
          icon={ClipboardList}
          title="Sin requisiciones"
          description="Genera una eligiendo los inventarios que quieres revisar."
        />
      ) : (
        <div className="space-y-2">
          {requisiciones.map((r) => (
            <Fila key={r.id} r={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function Fila({ r }: { r: RequisicionGuardada }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function marcar(estado: "enviada" | "cerrada") {
    start(async () => {
      try {
        unwrap(await cambiarEstado(r.id, estado));
        toast.success(estado === "enviada" ? "Marcada como enviada" : "Requisición cerrada");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo actualizar");
      }
    });
  }

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-sm font-semibold">{r.folio}</p>
          <Badge tone={TONO[r.estado]}>{ETIQUETA[r.estado]}</Badge>
        </div>
        <p className="mt-0.5 text-sm">
          {r.lineas} piezas distintas · {r.piezas} unidades
        </p>
        <p className="text-xs text-muted-foreground">
          {fecha(r.created_at)} · cobertura {r.cobertura_semanas} sem
          {r.notas ? ` · ${r.notas}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {/* Sending is what makes these quantities count against the next
            requisition, so it is a button and not a label. */}
        {r.estado === "borrador" && (
          <Button size="sm" onClick={() => marcar("enviada")} loading={pending}>
            Marcar enviada
          </Button>
        )}
        {r.estado === "enviada" && (
          <Button size="sm" variant="secondary" onClick={() => marcar("cerrada")} loading={pending}>
            Cerrar
          </Button>
        )}
      </div>
    </Card>
  );
}
