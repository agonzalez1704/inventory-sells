"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Trash2, PackageCheck, AlertTriangle, CheckCircle2, Ban, Clock } from "lucide-react";
import { formatMXN, fromCents } from "@/lib/money";
import { buscarProductos } from "@/modules/inventory/buscar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { SalesProduct } from "@/modules/sales/SalesScreen";
import { ponerItem, quitarItem, recibirCompra, cancelarCompra, type Compra } from "./actions";

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });

export function CompraDetalle({ compra }: { compra: Compra }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");
  const [elegido, setElegido] = useState<SalesProduct | null>(null);
  const [qty, setQty] = useState("1");
  const [costo, setCosto] = useState("");

  const items = compra.compra_items ?? [];
  const capturado = items.reduce((s, i) => s + Number(i.line_total_cents ?? 0), 0);
  const piezas = items.reduce((s, i) => s + Number(i.qty ?? 0), 0);
  const papel = compra.total_factura_cents;
  const diferencia = papel - capturado;
  const cuadra = papel === 0 || diferencia === 0;
  const editable = compra.estado === "borrador";

  // Search runs in the database. The whole catalog used to be loaded just to
  // filter it here, which is 21k products at the refaccionaria; the lines
  // already captured come embedded in compra_items and never needed it.
  const [resultados, setResultados] = useState<SalesProduct[]>([]);
  useEffect(() => {
    if (!query.trim()) {
      setResultados([]);
      return;
    }
    let cancelado = false;
    const t = setTimeout(async () => {
      try {
        const rows = (await buscarProductos({ query, limit: 8 })) as SalesProduct[];
        if (!cancelado) setResultados(rows);
      } catch {
        if (!cancelado) setResultados([]);
      }
    }, 180);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [query]);

  function agregar() {
    if (!elegido) return toast.error("Elige un producto");
    const q = parseInt(qty, 10);
    if (!Number.isInteger(q) || q <= 0) return toast.error("Cantidad inválida");
    start(async () => {
      try {
        await ponerItem(compra.id, elegido.id, q, parseFloat(costo.replace(",", ".")) || 0);
        toast.success(`${elegido.name} agregado`);
        setElegido(null);
        setQuery("");
        setQty("1");
        setCosto("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al agregar");
      }
    });
  }

  function quitar(itemId: string) {
    start(async () => {
      try {
        await quitarItem(compra.id, itemId);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al quitar");
      }
    });
  }

  function recibir() {
    if (!cuadra && !confirm("Lo capturado no cuadra con el total de la factura. ¿Recibir de todos modos?"))
      return;
    start(async () => {
      try {
        const r = await recibirCompra(compra.id);
        toast.success(`Recibido: ${r.piezas} piezas entraron al inventario`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al recibir");
      }
    });
  }

  function cancelar() {
    const msg =
      compra.estado === "recibida"
        ? "Esto devolverá al inventario lo que entró con esta factura. ¿Cancelar?"
        : "¿Cancelar esta compra?";
    if (!confirm(msg)) return;
    start(async () => {
      try {
        await cancelarCompra(compra.id);
        toast.success("Compra cancelada");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al cancelar");
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">
                {compra.folio_factura || "Sin folio"}
              </h1>
              <Badge
                tone={
                  compra.estado === "recibida"
                    ? "accent"
                    : compra.estado === "borrador"
                      ? "warning"
                      : "neutral"
                }
              >
                {compra.estado === "recibida"
                  ? "Recibida"
                  : compra.estado === "borrador"
                    ? "Borrador"
                    : "Cancelada"}
              </Badge>
              {compra.pronto_pago && (
                <Badge tone="accent">
                  Pronto pago {compra.pronto_pago_pct}% a {compra.pronto_pago_dias} días
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {compra.proveedores?.nombre ?? "—"} · ingresó {fecha(compra.fecha_ingreso)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {compra.condicion === "credito" ? (
                <>
                  <Clock className="mr-1 inline h-3 w-3" />
                  Crédito a {compra.dias_credito} días · vence {fecha(compra.vence_el)}
                </>
              ) : (
                "Contado"
              )}
            </p>
            {compra.notas && <p className="mt-1.5 text-xs text-muted-foreground">{compra.notas}</p>}
          </div>
          <div className="flex shrink-0 gap-2">
            {editable && (
              <Button onClick={recibir} loading={pending} disabled={items.length === 0}>
                <PackageCheck className="h-4 w-4" />
                Recibir mercancía
              </Button>
            )}
            {compra.estado !== "cancelada" && (
              <Button variant="ghost" onClick={cancelar} disabled={pending}>
                <Ban className="h-4 w-4" />
                Cancelar
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Cuadre contra el papel */}
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Dice la factura</p>
            <p className="text-lg font-semibold tabular-nums">{formatMXN(papel)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Capturado ({piezas} piezas)</p>
            <p className="text-lg font-semibold tabular-nums">{formatMXN(capturado)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Diferencia</p>
            <p
              className={`text-lg font-semibold tabular-nums ${
                cuadra ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
              }`}
            >
              {cuadra ? "Cuadra" : formatMXN(diferencia)}
            </p>
          </div>
        </div>
        {!cuadra && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {diferencia > 0
              ? "Falta capturar producto para llegar al total de la factura."
              : "Lo capturado excede el total de la factura."}
          </p>
        )}
        {cuadra && papel > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Lo capturado coincide con la factura.
          </p>
        )}
      </Card>

      {/* Alta de productos (solo borrador) */}
      {editable && (
        <Card className="space-y-3 p-4">
          <p className="text-sm font-medium">Agregar producto</p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={elegido ? `${elegido.name} (${elegido.sku})` : query}
              onChange={(e) => {
                setElegido(null);
                setQuery(e.target.value);
              }}
              placeholder="Buscar por nombre o SKU…"
              className="h-10 pl-9"
            />
          </div>
          {!elegido && resultados.length > 0 && (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {resultados.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => {
                      setElegido(p);
                      setQuery("");
                    }}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {p.name}
                      <span className="ml-2 text-xs text-muted-foreground">{p.sku}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {p.quantity} en stock
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {elegido && (
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Cantidad
                </span>
                <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Costo unitario (pesos)
                </span>
                <Input
                  value={costo}
                  onChange={(e) => setCosto(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                />
              </label>
              <div className="flex items-end">
                <Button onClick={agregar} loading={pending} className="w-full">
                  Agregar
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Renglones */}
      <Card className="overflow-hidden">
        {items.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Sin productos capturados todavía.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{i.products?.name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {i.products?.sku} · {i.qty} × {formatMXN(i.costo_unitario_cents)}
                  </p>
                </div>
                <p className="shrink-0 tabular-nums">{formatMXN(i.line_total_cents)}</p>
                {editable && (
                  <button
                    onClick={() => quitar(i.id)}
                    disabled={pending}
                    aria-label={`Quitar ${i.products?.name ?? "producto"}`}
                    className="shrink-0 cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-red-600 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
