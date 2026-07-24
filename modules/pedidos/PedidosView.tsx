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
import { confirmarTransferencia, cancelarPedido } from "./actions";

export type PedidoWeb = {
  id: string;
  folio: string;
  nombre: string;
  telefono: string;
  status: string;
  metodo: string | null;
  tipo_entrega: string;
  total_cents: number;
  created_at: string;
  orden_web_items: { nombre: string; qty: number }[];
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
}: {
  pedidos: PedidoWeb[];
  isAdmin: boolean;
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
            <PedidoRow key={p.id} p={p} isAdmin={isAdmin} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PedidoRow({ p, isAdmin }: { p: PedidoWeb; isAdmin: boolean }) {
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
        pendiente && esTransferencia ? "border-amber-300" : "border-border",
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
