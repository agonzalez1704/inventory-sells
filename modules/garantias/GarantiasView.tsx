"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, ShieldAlert, Check, X, RotateCcw, Trash2,
  ShieldCheck,
} from "lucide-react";
import { formatMXN } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GarantiaModal } from "./GarantiaModal";
import { GarantiasClienteList } from "./GarantiasClienteList";
import type { GarantiaCliente } from "./cliente-actions";
import { useConfirm } from "@/components/ui/use-confirm";
import { unwrap, type ActionResult } from "@/lib/errors";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { Proveedor } from "@/modules/proveedores/actions";
import {
  crearGarantia,
  resolverGarantia,
  reabrirGarantia,
  borrarGarantia,
  type Garantia,
  type GarantiaSaldo,
  type GarantiaEstado,
} from "./actions";

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });

const TONO: Record<GarantiaEstado, "warning" | "accent" | "neutral"> = {
  pendiente: "warning",
  aplicada: "accent",
  rechazada: "neutral",
};
const ETIQUETA: Record<GarantiaEstado, string> = {
  pendiente: "Pendiente",
  aplicada: "Aplicada",
  rechazada: "Rechazada",
};

export function GarantiasView({
  garantias,
  saldos,
  proveedores,
  deClientes = [],
}: {
  garantias: Garantia[];
  saldos: GarantiaSaldo[];
  proveedores: Proveedor[];
  deClientes?: GarantiaCliente[];
}) {
  const [query, setQuery] = useState("");
  const [nueva, setNueva] = useState(false);
  const [garantiaCliente, setGarantiaCliente] = useState(false);
  // Customer warranties open first when any is waiting on a decision.
  const [tab, setTab] = useState<"proveedor" | "cliente">(
    deClientes.some((g) => g.estado === "pendiente") ? "cliente" : "proveedor",
  );
  const [verResueltas, setVerResueltas] = useState(false);

  const { pendientes, resueltas } = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const match = (g: Garantia) => {
      if (!tokens.length) return true;
      const hay = `${g.descripcion} ${g.proveedores?.nombre ?? ""}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    };
    return {
      pendientes: garantias.filter((g) => g.estado === "pendiente" && match(g)),
      resueltas: garantias.filter((g) => g.estado !== "pendiente" && match(g)),
    };
  }, [garantias, query]);

  const totalDeuda = saldos.reduce((s, x) => s + x.pendiente_cents, 0);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Garantías</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tab === "proveedor"
              ? "Piezas que regresamos y que el proveedor nos debe rebajar"
              : "Piezas que un cliente nos regresó, y cómo se le resolvió"}
          </p>
        </div>
        {/* Two different things are called "garantía" here and anyone looking
            for either one comes to this page. The one against a supplier is
            what this screen lists; the one a customer claims lives on a sale,
            so it opens its own search. Both are reachable from where people
            actually look. */}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setGarantiaCliente(true)}>
            <ShieldCheck className="h-4 w-4" />
            De un cliente
          </Button>
          <Button onClick={() => setNueva(true)}>
            <Plus className="h-4 w-4" />
            A proveedor
          </Button>
        </div>
      </div>

      {/* Two ledgers that run in opposite directions under one word. Tabs
          rather than one merged list: "nos deben" and "les debemos" are read
          by different people asking different questions. */}
      <div className="inline-flex rounded-lg bg-muted p-0.5 text-sm">
        {(
          [
            ["proveedor", "A proveedor", garantias.length],
            ["cliente", "De clientes", deClientes.length],
          ] as const
        ).map(([v, label, n]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={cn(
              "cursor-pointer rounded-md px-3 py-1.5 font-medium transition-colors",
              tab === v
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {n > 0 && <span className="ml-1.5 text-xs text-muted-foreground">{n}</span>}
          </button>
        ))}
      </div>

      {tab === "cliente" ? (
        <GarantiasClienteList garantias={deClientes} />
      ) : (
      <>
      {saldos.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Nos deben</p>
            <p className="font-semibold tabular-nums">{formatMXN(totalDeuda)}</p>
          </div>
          <ul className="mt-3 space-y-1.5">
            {saldos.map((s) => (
              <li key={s.proveedor_id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {s.nombre}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {s.pendientes} {s.pendientes === 1 ? "pieza" : "piezas"}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{formatMXN(s.pendiente_cents)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por pieza o proveedor…"
          className="h-10 pl-9"
        />
      </div>

      {pendientes.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title={garantias.length === 0 ? "Sin garantías" : "Nada pendiente"}
          description={
            garantias.length === 0
              ? "Registra las piezas que le regresas a un proveedor para no perder el adeudo."
              : "Todas las garantías están resueltas."
          }
        />
      ) : (
        <div className="space-y-2.5">
          {pendientes.map((g) => (
            <GarantiaRow key={g.id} g={g} />
          ))}
        </div>
      )}

      {resueltas.length > 0 && (
        <div className="space-y-2.5">
          <button
            onClick={() => setVerResueltas((v) => !v)}
            className="cursor-pointer text-sm text-muted-foreground hover:text-foreground"
          >
            {verResueltas ? "Ocultar" : "Ver"} resueltas ({resueltas.length})
          </button>
          {verResueltas && resueltas.map((g) => <GarantiaRow key={g.id} g={g} />)}
        </div>
      )}
      </>
      )}

      {garantiaCliente && (
        <GarantiaModal onClose={() => setGarantiaCliente(false)} />
      )}
      {nueva && <NuevaGarantia proveedores={proveedores} onClose={() => setNueva(false)} />}
    </section>
  );
}

function GarantiaRow({ g }: { g: Garantia }) {
  const [confirmar, dialogoConfirm] = useConfirm();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [resolviendo, setResolviendo] = useState<"aplicada" | "rechazada" | null>(null);

  // Unwrapping here rather than at each button: these actions now return
  // { ok, error } instead of throwing, and a caller that ignores that would
  // report success on a failure.
  function run(fn: () => Promise<ActionResult<unknown>>, ok: string) {
    start(async () => {
      try {
        unwrap(await fn());
        toast.success(ok);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error");
      }
    });
  }

  return (
    <Card className={`p-4 ${g.estado === "pendiente" ? "" : "opacity-70"}`}>
      {dialogoConfirm}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{g.descripcion}</p>
            <Badge tone={TONO[g.estado]}>{ETIQUETA[g.estado]}</Badge>
            {g.qty > 1 && <Badge tone="neutral">{g.qty} piezas</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {g.proveedores?.nombre ?? "—"} · {fecha(g.fecha)}
          </p>
          {g.resolucion && (
            <p className="mt-1 text-xs text-muted-foreground">{g.resolucion}</p>
          )}
          {g.notas && <p className="mt-1 text-xs text-muted-foreground">{g.notas}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <p className="tabular-nums">{formatMXN(g.monto_cents)}</p>
          {g.estado === "pendiente" ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setResolviendo("aplicada")}
                disabled={pending}
              >
                <Check className="h-4 w-4" />
                Aplicada
              </Button>
              <button
                onClick={() => setResolviendo("rechazada")}
                disabled={pending}
                aria-label="Marcar rechazada"
                className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              onClick={() => run(() => reabrirGarantia(g.id), "Reabierta")}
              disabled={pending}
              aria-label="Reabrir garantía"
              className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={async () => {
              if (await confirmar({ title: "¿Borrar esta garantía?", confirmLabel: "Borrar", tone: "danger" }))
                run(() => borrarGarantia(g.id), "Borrada");
            }}
            disabled={pending}
            aria-label="Borrar garantía"
            className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-red-600 dark:hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {resolviendo && (
        <ResolverModal
          estado={resolviendo}
          onClose={() => setResolviendo(null)}
          onConfirm={(texto) =>
            run(
              () => resolverGarantia(g.id, resolviendo, texto),
              resolviendo === "aplicada" ? "Marcada como aplicada" : "Marcada como rechazada",
            )
          }
        />
      )}
    </Card>
  );
}

function ResolverModal({
  estado,
  onClose,
  onConfirm,
}: {
  estado: "aplicada" | "rechazada";
  onClose: () => void;
  onConfirm: (texto: string) => void;
}) {
  const [texto, setTexto] = useState("");
  return (
    <Modal
      open
      onClose={onClose}
      title={estado === "aplicada" ? "Garantía aplicada" : "Garantía rechazada"}
      className="max-w-md"
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            {estado === "aplicada" ? "¿Cómo la aplicaron?" : "¿Por qué la rechazaron?"}
          </span>
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={
              estado === "aplicada"
                ? "Rebajada en la factura F-900, repusieron la pieza…"
                : "Fuera de garantía, daño físico…"
            }
            autoFocus
          />
        </label>
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              onConfirm(texto);
              onClose();
            }}
          >
            Confirmar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function NuevaGarantia({
  proveedores,
  onClose,
}: {
  proveedores: Proveedor[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [proveedorId, setProveedorId] = useState(proveedores[0]?.id ?? "");
  const [descripcion, setDescripcion] = useState("");
  const [qty, setQty] = useState("1");
  const [monto, setMonto] = useState("");
  const [fechaG, setFechaG] = useState(new Date().toISOString().slice(0, 10));
  const [notas, setNotas] = useState("");

  function guardar() {
    if (!proveedorId) return toast.error("Elige el proveedor");
    if (!descripcion.trim()) return toast.error("Describe la pieza");
    start(async () => {
      try {
        unwrap(await crearGarantia({
          proveedor_id: proveedorId,
          product_id: null,
          descripcion,
          qty: parseInt(qty, 10) || 1,
          montoPesos: parseFloat(monto.replace(",", ".")) || 0,
          fecha: fechaG,
          notas: notas || null,
        }));
        toast.success("Garantía registrada");
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al registrar");
      }
    });
  }

  if (proveedores.length === 0) {
    return (
      <Modal open onClose={onClose} title="Garantía a proveedor" className="max-w-md">
        <p className="text-sm text-muted-foreground">
          Primero registra un proveedor para poder anotarle garantías.
        </p>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Garantía a proveedor" className="max-w-md">
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Proveedor</span>
          <Select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Pieza que se regresa
          </span>
          <Input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Pantalla iPhone 12 con línea vertical"
            autoFocus
          />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Cantidad</span>
            <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Monto (pesos)
            </span>
            <Input
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Fecha</span>
            <Input type="date" value={fechaG} onChange={(e) => setFechaG(e.target.value)} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Notas (opcional)
          </span>
          <Input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Falla, cuándo se detectó…"
          />
        </label>
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={guardar} loading={pending}>
            Registrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
