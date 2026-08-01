"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, FileText, Clock, AlertTriangle } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { Compra, CompraEstado, CuentaPorPagar } from "./actions";

const TONO: Record<CompraEstado, "neutral" | "accent" | "warning"> = {
  borrador: "warning",
  recibida: "accent",
  cancelada: "neutral",
};
const ETIQUETA: Record<CompraEstado, string> = {
  borrador: "Borrador",
  recibida: "Recibida",
  cancelada: "Cancelada",
};

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });

// Sum of the captured lines — what we compare against the invoice's own total.
export function capturado(c: Compra): number {
  return (c.compra_items ?? []).reduce((s, i) => s + Number(i.line_total_cents ?? 0), 0);
}

export function ComprasView({
  compras,
  porPagar,
}: {
  compras: Compra[];
  porPagar: CuentaPorPagar[];
}) {
  const [query, setQuery] = useState("");

  const filtradas = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return compras;
    return compras.filter((c) => {
      const hay = `${c.folio_factura ?? ""} ${c.proveedores?.nombre ?? ""}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [compras, query]);

  const borradores = filtradas.filter((c) => c.estado === "borrador").length;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Compras</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Facturas de proveedor y entrada de mercancía
            {borradores > 0 && ` · ${borradores} sin recibir`}
          </p>
        </div>
        <Link href="/compras/nueva">
          <Button>
            <Plus className="h-4 w-4" />
            Nueva compra
          </Button>
        </Link>
      </div>

      {porPagar.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Por pagar a proveedores</p>
            <p className="font-semibold tabular-nums">
              {formatMXN(porPagar.reduce((s, p) => s + p.saldo_cents, 0))}
            </p>
          </div>
          <ul className="mt-3 space-y-1.5">
            {porPagar.map((p) => (
              <li key={p.proveedor_id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {p.nombre}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {p.facturas} {p.facturas === 1 ? "factura" : "facturas"}
                  </span>
                  {p.vencidas > 0 && (
                    <Badge tone="warning" className="ml-2">
                      {p.vencidas} vencida{p.vencidas === 1 ? "" : "s"}
                    </Badge>
                  )}
                </span>
                <span className="shrink-0 tabular-nums">{formatMXN(p.saldo_cents)}</span>
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
          placeholder="Buscar por folio o proveedor…"
          className="h-10 pl-9"
        />
      </div>

      {filtradas.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={compras.length === 0 ? "Sin compras" : "Sin resultados"}
          description={
            compras.length === 0
              ? "Captura la factura de tu proveedor para que la mercancía entre al inventario."
              : "Prueba con otro folio o proveedor."
          }
        />
      ) : (
        <div className="space-y-2.5">
          {filtradas.map((c) => {
            const cap = capturado(c);
            const descuadre = c.total_factura_cents > 0 && cap !== c.total_factura_cents;
            return (
              <Link key={c.id} href={`/compras/${c.id}`} className="block">
                <Card className="p-4 transition-colors hover:bg-muted/40">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{c.folio_factura || "Sin folio"}</p>
                        <Badge tone={TONO[c.estado]}>{ETIQUETA[c.estado]}</Badge>
                        {c.condicion === "credito" && (
                          <Badge tone="neutral">
                            <Clock className="mr-1 inline h-3 w-3" />
                            {c.dias_credito} días
                          </Badge>
                        )}
                        {c.pronto_pago && <Badge tone="accent">Pronto pago</Badge>}
                        {descuadre && c.estado !== "cancelada" && (
                          <Badge tone="warning">
                            <AlertTriangle className="mr-1 inline h-3 w-3" />
                            No cuadra
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {c.proveedores?.nombre ?? "—"} · {fecha(c.fecha_ingreso)}
                        {c.condicion === "credito" && ` · vence ${fecha(c.vence_el)}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-medium tabular-nums">
                        {formatMXN(c.total_factura_cents || cap)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(c.compra_items ?? []).reduce((s, i) => s + Number(i.qty ?? 0), 0)} piezas
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
