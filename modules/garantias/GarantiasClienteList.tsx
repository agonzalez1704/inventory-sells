"use client";

import { useEffect, useState, useTransition } from "react";
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
import { proveedoresDelProducto, type ProveedorDelProducto } from "@/modules/cardex/actions";
import {
  resolverGarantia,
  reclamarAProveedor,
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

const PIDE: Record<string, string> = {
  saldo: "Pide saldo a favor",
  cambio: "Se lleva otra pieza",
  devolucion: "Escalada: quiere su dinero",
};

export function GarantiasClienteList({
  garantias,
  puedeAprobar,
  abrirId,
}: {
  garantias: GarantiaCliente[];
  /** Whoever reported it does not decide it. */
  puedeAprobar: boolean;
  /** From the notification's deep link — opens that claim straight away. */
  abrirId?: string | null;
}) {
  const [resolver, setResolver] = useState<GarantiaCliente | null>(
    () => (abrirId && puedeAprobar ? garantias.find((g) => g.id === abrirId && g.estado === "pendiente") ?? null : null),
  );
  const [reclamar, setReclamar] = useState<GarantiaCliente | null>(null);
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
          {!puedeAprobar && (
            <p className="text-xs text-muted-foreground">
              Ya está reportada. La aprueba alguien con permiso; al cliente se le
              confirma después.
            </p>
          )}
          {pendientes.map((g) => (
            <Fila
              key={g.id}
              g={g}
              onResolver={puedeAprobar ? () => setResolver(g) : undefined}
              onReclamar={() => setReclamar(g)}
              resaltar={g.id === abrirId}
            />
          ))}
        </div>
      )}

      {resueltas.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Resueltas</h2>
          {resueltas.map((g) => (
            <Fila key={g.id} g={g} onReclamar={() => setReclamar(g)} />
          ))}
        </div>
      )}

      {resolver && <ResolverModal g={resolver} onClose={() => setResolver(null)} />}
      {reclamar && <ReclamoModal g={reclamar} onClose={() => setReclamar(null)} />}
    </div>
  );
}

function Fila({
  g,
  onResolver,
  onReclamar,
  resaltar,
}: {
  g: GarantiaCliente;
  onResolver?: () => void;
  onReclamar?: () => void;
  resaltar?: boolean;
}) {
  // Only when the part did NOT go back on the shelf. Claiming one the shop
  // still has and can sell is asking the supplier to pay for stock — the
  // database refuses it, and offering the button would be offering a dead end.
  const puedeReclamar = !g.reingresa_stock && !g.garantia_proveedor_id;
  return (
    <Card
      className={cn(
        "p-4",
        g.estado === "rechazada" && "opacity-70",
        resaltar && "ring-2 ring-ring",
      )}
    >
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
          {g.estado === "pendiente" && g.resolucion_propuesta && (
            <p className="mt-1 text-sm font-medium text-amber-700 dark:text-amber-300">
              {PIDE[g.resolucion_propuesta]}
            </p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {fecha(g.created_at)}
            {g.reportada_por ? ` · reportó ${g.reportada_por}` : ""}
            {g.motivo ? ` · ${g.motivo}` : ""} ·{" "}
            <Link
              href={`/ventas?venta=${g.sale_id}`}
              className="underline-offset-2 hover:underline"
            >
              ver venta
            </Link>
          </p>
          {g.garantia_proveedor_id && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              Reclamada a {g.proveedor ?? "proveedor"}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-mono text-sm font-semibold tabular-nums">
            {formatMXN(g.monto_cents)}
          </span>
          {puedeReclamar && onReclamar && (
            <Button variant="secondary" size="sm" onClick={onReclamar}>
              Reclamar
            </Button>
          )}
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

function ReclamoModal({ g, onClose }: { g: GarantiaCliente; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [provs, setProvs] = useState<ProveedorDelProducto[] | null>(null);
  const [proveedorId, setProveedorId] = useState("");
  const [monto, setMonto] = useState("");
  const [notas, setNotas] = useState(g.motivo ?? "");

  useEffect(() => {
    let cancelado = false;
    proveedoresDelProducto(g.product_id)
      .then((r) => {
        if (cancelado) return;
        setProvs(r.proveedores);
        const primero = r.proveedores[0];
        if (primero) {
          setProveedorId(primero.proveedor_id);
          // Cost, not what the customer paid. Those are different numbers and
          // claiming the second asks the supplier for the shop's margin too.
          setMonto(((primero.costo_ultimo_cents * g.qty) / 100).toFixed(2));
        }
      })
      .catch(() => !cancelado && setProvs([]));
    return () => {
      cancelado = true;
    };
  }, [g.product_id, g.qty]);

  function elegir(id: string) {
    setProveedorId(id);
    const p = provs?.find((x) => x.proveedor_id === id);
    if (p) setMonto(((p.costo_ultimo_cents * g.qty) / 100).toFixed(2));
  }

  function guardar() {
    if (!proveedorId) return toast.error("Elige el proveedor");
    const cents = Math.round((Number(monto.replace(",", ".")) || 0) * 100);
    start(async () => {
      try {
        unwrap(await reclamarAProveedor(g.id, proveedorId, cents || null, notas || null));
        toast.success("Reclamo creado y ligado a la garantía");
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo crear el reclamo");
      }
    });
  }

  return (
    <Modal open onClose={onClose} title="Reclamar al proveedor" className="max-w-md">
      <div className="space-y-4">
        <div className="rounded-xl border border-border p-3">
          <p className="text-sm font-medium">{g.pieza}</p>
          <p className="text-xs text-muted-foreground">
            {g.qty} {g.qty === 1 ? "pieza" : "piezas"} · el cliente pagó{" "}
            {formatMXN(g.monto_cents)}
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Proveedor
          </span>
          {provs === null ? (
            <p className="text-sm text-muted-foreground">Buscando quién nos la vendió…</p>
          ) : provs.length === 0 ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Esta pieza no tiene compras registradas, así que no sabemos quién
              la surtió. Captura el reclamo desde la pestaña “A proveedor”.
            </p>
          ) : (
            <Select value={proveedorId} onChange={(e) => elegir(e.target.value)}>
              {provs.map((p) => (
                <option key={p.proveedor_id} value={p.proveedor_id}>
                  {p.nombre} — último costo {formatMXN(p.costo_ultimo_cents)}
                </option>
              ))}
            </Select>
          )}
        </label>

        {provs && provs.length > 0 && (
          <>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Monto a reclamar
              </span>
              <Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" />
              {/* The gap is the shop's margin and is not the supplier's to pay. */}
              <span className="mt-1.5 block text-xs text-muted-foreground">
                Va a costo, no a lo que pagó el cliente ({formatMXN(g.monto_cents)}).
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Notas</span>
              <Input
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Qué falló"
              />
            </label>
          </>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={guardar} loading={pending} disabled={!proveedorId}>
            Crear reclamo
          </Button>
        </div>
      </div>
    </Modal>
  );
}
