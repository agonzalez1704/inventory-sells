"use client";

import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Package,
  Truck,
  ExternalLink,
  History,
} from "lucide-react";
import { formatMXN } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type {
  CardexProducto,
  CardexResumen,
  MovimientoCardex,
  ProveedorDelProducto,
} from "./actions";

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function CardexView({
  producto,
  movimientos,
  resumen,
  surtido,
  verCostos,
}: {
  producto: CardexProducto;
  movimientos: MovimientoCardex[];
  resumen: CardexResumen;
  surtido: { proveedores: ProveedorDelProducto[]; sinOrigen: number };
  verCostos: boolean;
}) {
  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">{producto.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {producto.sku}
              {producto.proveedor && (
                <>
                  {" · "}
                  <span className="inline-flex items-center gap-1">
                    <Truck className="h-3.5 w-3.5" />
                    {producto.proveedor}
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-muted-foreground">En existencia</p>
            <p className="text-2xl font-semibold tabular-nums">{producto.quantity}</p>
          </div>
        </div>
      </Card>

      {/* Totals over the window read, said plainly so nobody reads them as all-time */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Comprado</p>
          <p className="text-lg font-semibold tabular-nums">{resumen.comprado}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Vendido</p>
          <p className="text-lg font-semibold tabular-nums">{resumen.vendido}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Devuelto</p>
          <p className="text-lg font-semibold tabular-nums">{resumen.devuelto}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">
            {verCostos ? "Costo promedio pagado" : "Precio de venta"}
          </p>
          <p className="text-lg font-semibold tabular-nums">
            {verCostos
              ? resumen.costoPromedioCents != null
                ? formatMXN(resumen.costoPromedioCents)
                : "—"
              : formatMXN(producto.price_cents)}
          </p>
        </Card>
      </div>

      {verCostos && (surtido.proveedores.length > 0 || surtido.sinOrigen > 0) && (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Truck className="h-4 w-4" />
            <p className="text-sm font-medium">Quién lo surte</p>
            <span className="ml-auto text-xs text-muted-foreground">
              del más barato al más caro
            </span>
          </div>
          <ul className="divide-y divide-border">
            {surtido.proveedores.map((pr) => (
              <li key={pr.proveedor_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {pr.nombre}
                    {pr.piezas_en_stock > 0 && (
                      <Badge tone="accent">{pr.piezas_en_stock} en stock</Badge>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {pr.veces} compra{pr.veces === 1 ? "" : "s"} · {pr.piezas_compradas} pzas ·
                    última {pr.ultima_compra}
                    {pr.lead_time_dias > 0 && ` · entrega ~${pr.lead_time_dias} d`}
                    {pr.telefono && ` · ${pr.telefono}`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono font-semibold tabular-nums">
                    {formatMXN(pr.costo_ultimo_cents)}
                  </p>
                  {pr.costo_min_cents !== pr.costo_ultimo_cents && (
                    <p className="text-xs text-muted-foreground">
                      mínimo {formatMXN(pr.costo_min_cents)}
                    </p>
                  )}
                </div>
              </li>
            ))}
            {surtido.sinOrigen > 0 && (
              <li className="px-4 py-2.5 text-xs text-muted-foreground">
                {surtido.sinOrigen} pieza{surtido.sinOrigen === 1 ? "" : "s"} sin proveedor
                identificado — entraron por carga inicial o ajuste, antes de que se
                registraran compras.
              </li>
            )}
          </ul>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <History className="h-4 w-4" />
          <p className="text-sm font-medium">Movimientos</p>
          <span className="ml-auto text-xs text-muted-foreground">
            {movimientos.length === 200 ? "últimos 200" : `${movimientos.length} en total`}
          </span>
        </div>

        {movimientos.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Sin movimientos"
            description="Esta pieza no tiene entradas ni salidas registradas."
          />
        ) : (
          <ul className="divide-y divide-border">
            {movimientos.map((m) => {
              const entra = m.delta > 0;
              return (
                <li key={m.id} className="flex items-start gap-3 px-4 py-3">
                  <span
                    className={`mt-0.5 shrink-0 rounded-full p-1.5 ${
                      entra
                        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {entra ? (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowDownRight className="h-3.5 w-3.5" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{m.titulo}</p>
                      {verCostos && m.costo_unitario_cents != null && (
                        <Badge tone="neutral">{formatMXN(m.costo_unitario_cents)} c/u</Badge>
                      )}
                    </div>
                    {m.detalle && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {m.href ? (
                          <Link
                            href={m.href}
                            className="inline-flex items-center gap-1 hover:text-foreground"
                          >
                            {m.detalle}
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : (
                          m.detalle
                        )}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {fechaHora(m.fecha)} · {m.quien}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p
                      className={`text-sm font-semibold tabular-nums ${
                        entra ? "text-emerald-600 dark:text-emerald-400" : ""
                      }`}
                    >
                      {entra ? "+" : ""}
                      {m.delta}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">quedan {m.saldo}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
