"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Package,
  Truck,
  Store,
  ExternalLink,
  Check,
  X,
  Landmark,
  Clock,
} from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { comprobantesDeOrden, type Comprobante } from "@/modules/sales/comprobantes";
import { CuentaChip } from "@/components/ui/cuenta";
import { useEffect } from "react";
import { confirmarTransferencia, cancelarPedido, marcarDropshipPedido } from "./actions";

export type ItemPedido = {
  nombre: string;
  qty: number;
  products: { enlace_proveedor: string | null; inventories: { es_dropship: boolean | null } | null } | null;
};

export type PedidoWeb = {
  id: string;
  folio: string;
  nombre: string;
  telefono: string;
  email: string | null;
  cp: string | null;
  estado: string | null;
  municipio: string | null;
  direccion: string | null;
  referencias: string | null;
  status: string;
  metodo: string | null;
  tipo_entrega: string;
  total_cents: number;
  created_at: string;
  dropship_estado: "por_pedir" | "pidiendo" | "pedido" | null;
  dropship_ref: string | null;
  orden_web_items: ItemPedido[];
};

const METODO_LABEL: Record<string, string> = {
  card: "Tarjeta",
  oxxo: "OXXO",
  spei: "SPEI",
  aplazo: "Aplazo",
  transferencia: "Transferencia directa",
};

export function PedidosView({
  pedidos,
  isAdmin,
  dirTienda = null,
}: {
  pedidos: PedidoWeb[];
  isAdmin: boolean;
  /** Shop address: where the supplier ships a dropship order for pickup. */
  dirTienda?: string | null;
}) {
  const pendientes = pedidos.filter((p) => p.status === "pendiente").length;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pedidos en línea</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {pendientes > 0
            ? `${pendientes} pendiente${pendientes > 1 ? "s" : ""} de confirmar o preparar`
            : "Pedidos de la tienda web"}
          {!isAdmin && " · confirmar y cancelar es solo para administradores"}
        </p>
      </div>

      {pedidos.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Sin pedidos web todavía"
          description="Aquí aparecen los pedidos que entran por la tienda en línea."
        />
      ) : (
        <ul className="space-y-3">
          {pedidos.map((p) => (
            <PedidoRow key={p.id} p={p} isAdmin={isAdmin} dirTienda={dirTienda} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PedidoRow({
  p,
  isAdmin,
  dirTienda,
}: {
  p: PedidoWeb;
  isAdmin: boolean;
  dirTienda: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmandoCancel, setConfirmandoCancel] = useState(false);

  const recoger = p.tipo_entrega === "recoger";
  const esTransferencia = p.metodo === "transferencia";
  const pendiente = p.status === "pendiente";
  const items = p.orden_web_items ?? [];
  const fecha = new Date(p.created_at).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  function confirmar() {
    start(async () => {
      const r = await confirmarTransferencia(p.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Pago confirmado · ${p.folio}`);
      router.refresh();
    });
  }

  function cancelar() {
    start(async () => {
      const r = await cancelarPedido(p.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Pedido cancelado · ${p.folio}`);
      setConfirmandoCancel(false);
      router.refresh();
    });
  }

  return (
    <li
      className={cn(
        "rounded-2xl border bg-card p-4",
        pendiente && esTransferencia ? "border-amber-300 dark:border-amber-800" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold">{p.folio}</span>
            <StatusBadge status={p.status} />
            <Badge tone="neutral">
              {recoger ? <Store className="mr-1 h-3 w-3" /> : <Truck className="mr-1 h-3 w-3" />}
              {recoger ? "Recoger" : "Envío"}
            </Badge>
            {p.metodo && (
              <Badge tone={esTransferencia ? "warning" : "neutral"}>
                {esTransferencia && <Landmark className="mr-1 h-3 w-3" />}
                {METODO_LABEL[p.metodo] ?? p.metodo}
              </Badge>
            )}
          </div>
          <p className="mt-1.5 text-sm font-medium text-foreground">{p.nombre}</p>
          <p className="text-xs text-muted-foreground">
            {p.telefono} · <Clock className="inline h-3 w-3" /> {fecha}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {items.map((i) => `${i.qty}× ${i.nombre}`).join(", ")}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-lg font-semibold tabular-nums">{formatMXN(p.total_cents)}</p>
          <Link
            href={`/tienda/orden/${p.id}`}
            target="_blank"
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-foreground hover:underline"
          >
            Ver pedido <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {p.status === "pagada" && p.dropship_estado && (
        <BloqueDropship p={p} isAdmin={isAdmin} dirTienda={dirTienda} />
      )}

      {pendiente && esTransferencia && <ComprobantesOrden ordenId={p.id} />}

      {isAdmin && pendiente && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          {esTransferencia && (
            <Button size="sm" onClick={confirmar} loading={pending}>
              <Check className="h-4 w-4" />
              Confirmar pago recibido
            </Button>
          )}
          {confirmandoCancel ? (
            <>
              <Button size="sm" variant="danger" onClick={cancelar} loading={pending}>
                Sí, cancelar y liberar stock
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmandoCancel(false)} disabled={pending}>
                No
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmandoCancel(true)} disabled={pending}>
              <X className="h-4 w-4" />
              Cancelar
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "pagada") return <Badge tone="accent">Pagado</Badge>;
  if (status === "cancelada") return <Badge tone="neutral">Cancelado</Badge>;
  return <Badge tone="warning">Pendiente</Badge>;
}

/** Split one paid order into its two shipments and drive the supplier one. */
function BloqueDropship({
  p,
  isAdmin,
  dirTienda,
}: {
  p: PedidoWeb;
  isAdmin: boolean;
  dirTienda: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ref, setRef] = useState("");

  const esDrop = (i: ItemPedido) => i.products?.inventories?.es_dropship ?? false;
  const drop = p.orden_web_items.filter(esDrop);
  const fisicos = p.orden_web_items.filter((i) => !esDrop(i));
  const recoger = p.tipo_entrega === "recoger";

  // What gets pasted into the supplier's checkout, one block, one copy.
  const direccion = recoger
    ? `${p.nombre}\n${dirTienda ?? "Dirección de la tienda (configúrala en Configuración)"}\nTel: ${p.telefono}`
    : [
        p.nombre,
        [p.direccion, p.referencias].filter(Boolean).join(", "),
        `${p.municipio ?? ""}, ${p.estado ?? ""}, CP ${p.cp ?? ""}`,
        `Tel: ${p.telefono}`,
      ].join("\n");

  function marcar() {
    start(async () => {
      const r = await marcarDropshipPedido(p.id, ref);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Pedido al proveedor registrado · ${p.folio}`);
      router.refresh();
    });
  }

  if (p.dropship_estado === "pedido") {
    return (
      <div className="mt-3 rounded-xl border border-green-300/60 bg-green-50 p-3 text-xs text-green-800 dark:border-green-800/60 dark:bg-green-950/30 dark:text-green-300">
        <Check className="mr-1 inline h-3.5 w-3.5" />
        Pedido al proveedor · <span className="font-mono font-semibold">{p.dropship_ref}</span>
        {fisicos.length > 0 && " — el bloque de tienda se envía aparte, como siempre."}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-amber-300/60 bg-amber-50 p-3 dark:border-amber-700/50 dark:bg-amber-950/30">
      {p.dropship_estado === "pidiendo" && (
        // In-flight (or crashed mid-flight): the manual block stays visible as
        // the escape hatch — the auto-purchase claim makes doubles impossible
        // from our side, and a human is slower than the 30s call anyway.
        <p className="text-xs text-muted-foreground">
          Pidiendo a AliExpress automáticamente… si esto no cambia en un minuto,
          pídelo a mano aquí abajo.
        </p>
      )}
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
        Pedir al proveedor — con el dinero ya cobrado
      </p>
      <ul className="space-y-1">
        {drop.map((i, idx) => (
          <li key={idx} className="text-sm text-foreground">
            {i.qty}× {i.nombre}
            {i.products?.enlace_proveedor && (
              <a
                href={i.products.enlace_proveedor}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-brand-foreground hover:underline"
              >
                Abrir en proveedor <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </li>
        ))}
      </ul>
      <div className="rounded-lg border border-amber-300/50 bg-background/60 p-2">
        <p className="whitespace-pre-line font-mono text-xs text-foreground">{direccion}</p>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(direccion);
            toast.success("Dirección copiada");
          }}
          className="mt-1.5 cursor-pointer text-xs font-medium text-amber-800 hover:underline dark:text-amber-300"
        >
          Copiar dirección de entrega
        </button>
      </div>
      {fisicos.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Envío aparte desde tienda: {fisicos.map((i) => `${i.qty}× ${i.nombre}`).join(", ")}
        </p>
      )}
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="Núm. de orden del proveedor"
            className="h-9 max-w-56"
          />
          <Button size="sm" onClick={marcar} loading={pending} disabled={!ref.trim()}>
            <Check className="h-4 w-4" />
            Marcar pedido
          </Button>
        </div>
      )}
    </div>
  );
}

/** The customer's uploaded transfer proof, right where the admin confirms it. */
function ComprobantesOrden({ ordenId }: { ordenId: string }) {
  const [rows, setRows] = useState<Comprobante[]>([]);
  useEffect(() => {
    let on = true;
    comprobantesDeOrden(ordenId)
      .then((r) => on && setRows(r))
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [ordenId]);
  if (rows.length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-green-300/60 bg-green-50 px-3 py-2 dark:border-green-800/60 dark:bg-green-950/30">
      <p className="text-xs font-semibold text-green-800 dark:text-green-300">
        El cliente ya envió su comprobante:
      </p>
      <ul className="mt-1 space-y-0.5">
        {rows.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 text-xs text-green-900 dark:text-green-200">
            {c.cuenta && <CuentaChip cuenta={c.cuenta} />}
            {c.referencia && <span className="font-mono">{c.referencia}</span>}
            {c.imagen_url && (
              <a
                href={c.imagen_url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline underline-offset-2"
              >
                Ver captura
              </a>
            )}
            <span className="opacity-70">
              {new Date(c.created_at).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
