"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, ClipboardList, Copy, MessageCircle, PackageCheck, Truck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { entregaTexto } from "@/modules/proveedores/ProveedoresView";
import {
  asignarProveedorASku,
  cerrarPedidoSurtido,
  marcarPedidoProveedor,
  type FaltantesProveedor,
  type PedidoSurtido,
} from "./actions";

const TZ = "America/Mexico_City";
const cuando = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

const wa = (telefono: string | null, mensaje: string) => {
  const d = (telefono ?? "").replace(/\D/g, "");
  const num = d.length === 10 ? `52${d}` : d;
  return `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`;
};

/**
 * The buyer's screen: what the live quotes promise beyond the shelf, grouped by
 * who to ask. Asking is the point, so the message to the supplier and "already
 * ordered" live here — otherwise the same piece gets ordered twice.
 */
export function SurtidoView({
  grupos,
  enCamino,
  proveedores,
  negocio,
}: {
  grupos: FaltantesProveedor[];
  enCamino: PedidoSurtido[];
  proveedores: { id: string; nombre: string; telefono: string | null }[];
  /** Shop name, for the message the supplier reads. */
  negocio: string;
}) {
  const [tab, setTab] = useState<"pedir" | "camino">("pedir");
  const piezas = grupos.reduce((s, g) => s + g.piezas, 0);

  return (
    <section className="space-y-5" data-ancho="completo">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Por surtir</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Piezas que faltan para cumplir las cotizaciones abiertas
            {piezas > 0 && (
              <>
                {" · "}
                <b className="text-foreground">
                  {piezas} {piezas === 1 ? "pieza" : "piezas"}
                </b>
                {" · "}
                {grupos.length} {grupos.length === 1 ? "proveedor" : "proveedores"}
              </>
            )}
          </p>
        </div>
        <div className="inline-flex rounded-xl bg-muted p-1 text-sm">
          {(
            [
              ["pedir", "Por pedir", piezas],
              ["camino", "Por llegar", enCamino.length],
            ] as const
          ).map(([k, label, n]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn("inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3 font-medium", tab === k ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {label}
              <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{n}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === "pedir" ? (
        grupos.length === 0 ? (
          <EmptyState icon={PackageCheck} title="Nada por pedir" description="Todo lo cotizado está en existencia o ya viene en camino." />
        ) : (
          <div className="space-y-4">
            {grupos.map((g) => (
              <Grupo key={g.proveedorId ?? "sin"} g={g} proveedores={proveedores} negocio={negocio} />
            ))}
          </div>
        )
      ) : enCamino.length === 0 ? (
        <EmptyState icon={Truck} title="Nada en camino" description="Lo que marques como pedido aparece aquí hasta que llegue." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-background">
          {enCamino.map((p) => (
            <FilaEnCamino key={p.id} p={p} />
          ))}
        </div>
      )}
    </section>
  );
}

function Grupo({
  g,
  proveedores,
  negocio,
}: {
  g: FaltantesProveedor;
  proveedores: { id: string; nombre: string; telefono: string | null }[];
  negocio: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const sinProveedor = g.proveedorId === null;

  const mensaje = useMemo(
    () =>
      [
        `Hola, soy de ${negocio}. Te encargo:`,
        ...g.lineas.map((l) => `• ${l.porPedir}× ${l.nombre}${l.sku ? ` (${l.sku})` : ""}`),
        "¿Me confirmas precio y cuándo llega? Gracias.",
      ].join("\n"),
    [g.lineas, negocio],
  );

  function marcar() {
    start(async () => {
      const r = await marcarPedidoProveedor({
        proveedorId: g.proveedorId,
        lineas: g.lineas.map((l) => ({ sku: l.sku, nombre: l.nombre, qty: l.porPedir })),
        nota: null,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${r.data.n} ${r.data.n === 1 ? "pieza" : "líneas"} en camino`, { description: `${g.proveedor} · aparecen en "Por llegar"` });
      router.refresh();
    });
  }

  return (
    <div className={cn("overflow-hidden rounded-2xl border bg-background", sinProveedor ? "border-amber-300 dark:border-amber-800" : "border-border")}>
      <div className={cn("flex flex-wrap items-center gap-3 px-4 py-3", sinProveedor && "bg-amber-50/70 dark:bg-amber-950/20")}>
        {sinProveedor ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" /> : <Truck className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">{g.proveedor}</p>
          <p className="text-xs text-muted-foreground">
            {sinProveedor
              ? "Asigna a quién pedirle cada pieza para poder encargarlas"
              : `${g.lineas.length} ${g.lineas.length === 1 ? "producto" : "productos"} · ${g.piezas} ${g.piezas === 1 ? "pieza" : "piezas"} · llega ${entregaTexto(g.leadTimeDias)}`}
          </p>
        </div>
        {!sinProveedor && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="h-9"
              onClick={() => {
                navigator.clipboard.writeText(mensaje);
                toast.success("Lista copiada");
              }}
            >
              <Copy className="h-4 w-4" />
              <span className="hidden sm:inline">Copiar lista</span>
            </Button>
            {g.telefono && (
              <a
                href={wa(g.telefono, mensaje)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
              >
                <MessageCircle className="h-4 w-4 text-emerald-600" />
                Pedir por WhatsApp
              </a>
            )}
            <Button size="sm" className="h-9" onClick={marcar} loading={pending}>
              <Check className="h-4 w-4" />
              Marcar pedido
            </Button>
          </div>
        )}
      </div>

      <ul>
        {g.lineas.map((l) => (
          <li key={l.sku} className="flex flex-wrap items-center gap-3 border-t border-border/70 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{l.nombre}</p>
              <p className="truncate text-xs text-muted-foreground">
                <span className="font-mono">{l.sku}</span> · {l.pedidas} cotizadas · {l.enExistencia} en existencia
                {l.yaPedidas > 0 && ` · ${l.yaPedidas} en camino`} · para{" "}
                {l.folios.map((f, k) => (
                  <span key={f}>
                    {k > 0 && ", "}
                    <Link href={`/cotizaciones?folio=${f}`} className="font-medium text-amber-700 hover:underline dark:text-amber-400">
                      {f}
                    </Link>
                  </span>
                ))}
              </p>
            </div>
            {sinProveedor && <AsignarProveedor productIds={l.productIds} proveedores={proveedores} />}
            <div className="flex shrink-0 flex-col items-end">
              <span className="text-[11px] text-muted-foreground">pedir</span>
              <span className="text-xl font-semibold tabular-nums">{l.porPedir}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AsignarProveedor({
  productIds,
  proveedores,
}: {
  productIds: string[];
  proveedores: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (proveedores.length === 0)
    return (
      <Link href="/proveedores" className="text-sm font-medium text-amber-700 hover:underline dark:text-amber-400">
        Registrar proveedor →
      </Link>
    );

  return (
    <Select
      aria-label="Elegir proveedor"
      defaultValue=""
      disabled={pending}
      className="h-10 w-full sm:w-48"
      onChange={(e) => {
        const id = e.target.value;
        if (!id) return;
        start(async () => {
          const r = await asignarProveedorASku(productIds, id);
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          toast.success("Proveedor asignado");
          router.refresh();
        });
      }}
    >
      <option value="">Elegir proveedor…</option>
      {proveedores.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nombre}
        </option>
      ))}
    </Select>
  );
}

function FilaEnCamino({ p }: { p: PedidoSurtido }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function cerrar(estado: "recibido" | "cancelado") {
    start(async () => {
      const r = await cerrarPedidoSurtido(p.id, estado);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(estado === "recibido" ? "Marcado como recibido" : "Ya no viene");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border/70 px-4 py-3 last:border-0">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
        <Truck className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {p.qty}× {p.nombre ?? p.sku}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {[p.proveedor ?? "Sin proveedor", `pedido por ${p.quien}`, cuando(p.pedidoAt)].join(" · ")}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="h-9" onClick={() => cerrar("recibido")} loading={pending}>
          <PackageCheck className="h-4 w-4" />
          Ya llegó
        </Button>
        <Button variant="ghost" size="icon" aria-label="Ya no viene" onClick={() => cerrar("cancelado")} disabled={pending}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/** Kept so the nav icon and the empty page have something to show. */
export const IconoSurtido = ClipboardList;
