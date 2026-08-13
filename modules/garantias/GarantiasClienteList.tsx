"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { ShieldCheck, PackageX, PackageCheck } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { unwrap } from "@/lib/errors";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import {
  resolverGarantia,
  type GarantiaCliente,
  type ResolucionGarantia,
} from "./cliente-actions";

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });

const TONO = {
  pendiente: "warning",
  aceptada: "accent",
  rechazada: "neutral",
} as const;

const RESOLUCION = {
  saldo: "Saldo a favor",
  cambio: "Cambio físico",
  efectivo: "Efectivo",
} as const;

export function GarantiasClienteList({ garantias }: { garantias: GarantiaCliente[] }) {
  const [resolver, setResolver] = useState<GarantiaCliente | null>(null);
  const pendientes = garantias.filter((g) => g.estado === "pendiente");
  const resueltas = garantias.filter((g) => g.estado !== "pendiente");

  if (garantias.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Sin garantías de clientes"
        description="Se registran desde una venta, o con el botón “De un cliente”."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Pending first and under their own heading: these are the ones somebody
          still has to decide. A single mixed list buries them. */}
      {pendientes.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Por resolver ({pendientes.length})
          </h2>
          {pendientes.map((g) => (
            <Fila key={g.id} g={g} onResolver={() => setResolver(g)} />
          ))}
        </div>
      )}

      {resueltas.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Resueltas</h2>
          {resueltas.map((g) => (
            <Fila key={g.id} g={g} />
          ))}
        </div>
      )}

      {resolver && <ResolverModal g={resolver} onClose={() => setResolver(null)} />}
    </div>
  );
}

function Fila({ g, onResolver }: { g: GarantiaCliente; onResolver?: () => void }) {
  return (
    <Card className={cn("p-4", g.estado === "rechazada" && "opacity-70")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{g.cliente}</p>
            <Badge tone={TONO[g.estado]}>
              {g.estado === "pendiente"
                ? "Por resolver"
                : g.estado === "aceptada"
                  ? (g.resolucion ? RESOLUCION[g.resolucion] : "Aceptada")
                  : "Rechazada"}
            </Badge>
            {/* Where the part went matters as much as the money: it is the
                difference between stock that can be sold and stock that is
                waiting on a supplier claim. */}
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              {g.reingresa_stock ? (
                <>
                  <PackageCheck className="h-3.5 w-3.5" /> volvió a existencias
                </>
              ) : (
                <>
                  <PackageX className="h-3.5 w-3.5" /> fuera de existencias
                </>
              )}
            </span>
          </div>
          <p className="mt-1 text-sm">
            <span className="font-mono text-xs uppercase text-muted-foreground">{g.sku}</span>{" "}
            {g.pieza} {g.qty > 1 && `× ${g.qty}`}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {fecha(g.created_at)}
            {g.motivo ? ` · ${g.motivo}` : ""} ·{" "}
            <Link
              href={`/ventas?venta=${g.sale_id}`}
              className="underline-offset-2 hover:underline"
            >
              ver venta
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-mono text-sm font-semibold tabular-nums">
            {formatMXN(g.monto_cents)}
          </span>
          {onResolver && (
            <Button size="sm" onClick={onResolver}>
              Resolver
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function ResolverModal({ g, onClose }: { g: GarantiaCliente; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [resolucion, setResolucion] = useState<ResolucionGarantia | "rechazar">("saldo");
  const [motivo, setMotivo] = useState(g.motivo ?? "");

  function guardar() {
    start(async () => {
      try {
        unwrap(
          await resolverGarantia(
            g.id,
            resolucion === "rechazar" ? null : resolucion,
            motivo || null,
          ),
        );
        toast.success(
          resolucion === "saldo"
            ? `${formatMXN(g.monto_cents)} de saldo a favor para ${g.cliente}`
            : resolucion === "rechazar"
              ? "Garantía rechazada"
              : "Garantía resuelta",
        );
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo resolver");
      }
    });
  }

  return (
    <Modal open onClose={onClose} title="Resolver garantía" className="max-w-md">
      <div className="space-y-4">
        <div className="rounded-xl border border-border p-3">
          <p className="text-sm font-medium">{g.pieza}</p>
          <p className="text-xs text-muted-foreground">
            {g.cliente} · {formatMXN(g.monto_cents)}
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            ¿Cómo se resuelve?
          </span>
          <Select
            value={resolucion}
            onChange={(e) => setResolucion(e.target.value as ResolucionGarantia | "rechazar")}
          >
            <option value="saldo">Saldo a favor</option>
            <option value="cambio">Cambio físico</option>
            <option value="efectivo">Devolución en efectivo</option>
            <option value="rechazar">Rechazar</option>
          </Select>
          {resolucion === "saldo" && (
            <span className="mt-1.5 block text-xs text-muted-foreground">
              Se abonan {formatMXN(g.monto_cents)} a {g.cliente}.
            </span>
          )}
          {resolucion === "efectivo" && (
            <span className="mt-1.5 block text-xs text-amber-700 dark:text-amber-300">
              Esto solo deja el registro. El dinero se entrega con una devolución
              aparte, para que salga en el corte del día.
            </span>
          )}
          {resolucion === "rechazar" && (
            <span className="mt-1.5 block text-xs text-muted-foreground">
              Queda registrada como rechazada, no se borra: es lo que le muestras
              al cliente si vuelve a preguntar.
            </span>
          )}
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Nota</span>
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Qué se revisó, qué se decidió…"
          />
        </label>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={guardar} loading={pending}>
            Resolver
          </Button>
        </div>
      </div>
    </Modal>
  );
}
