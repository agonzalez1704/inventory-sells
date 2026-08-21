"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Trash2, PackageCheck, AlertTriangle, CheckCircle2, Ban, Clock, FileDown } from "lucide-react";
import { formatMXN, fromCents } from "@/lib/money";
import { buscarProductos } from "@/modules/inventory/buscar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { SalesProduct } from "@/modules/sales/SalesScreen";
import { ponerItem, quitarItem, recibirCompra, cancelarCompra, registrarNota, type Compra } from "./actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CargarFactura } from "./CargarFactura";

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

  const [confirmarRecibo, setConfirmarRecibo] = useState(false);
  const [confirmarCancelar, setConfirmarCancelar] = useState<string | null>(null);

  function recibir() {
    // A mismatch is a decision, not a warning to click past: the goods that
    // didn't arrive have to become a credit note or the supplier keeps being
    // owed for them.
    if (!cuadra) return setConfirmarRecibo(true);
    hacerRecibo();
  }

  function hacerRecibo() {
    setConfirmarRecibo(false);
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

  /**
   * Turn the shortfall into a "no llegó" credit note, then receive.
   *
   * This is what makes both outcomes work: on credit you now owe only what
   * arrived, and if the invoice was already paid in full the balance goes
   * negative — which is the credit you hold with that supplier.
   */
  function notaYRecibir() {
    setConfirmarRecibo(false);
    const falta = Math.abs(diferencia);
    start(async () => {
      // Receive FIRST. crear_nota_credito refuses anything that isn't already
      // received — "solo una compra recibida admite notas de crédito" — and the
      // order is right on its own terms: receiving moves the stock that actually
      // arrived, and the note then records that the invoice charged for more.
      let recibida = false;
      try {
        const r = await recibirCompra(compra.id);
        recibida = true;
        await registrarNota({
          compraId: compra.id,
          tipo: "no_llego",
          motivo: `No llegó: diferencia contra la factura ${compra.folio_factura ?? ""}`.trim(),
          items: [],
          montoPesos: falta / 100,
        });
        toast.success(
          `Recibido: ${r.piezas} piezas · nota por ${formatMXN(falta)} registrada`,
        );
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error al recibir";
        // Two steps, and the second can fail on its own. Say which state the
        // purchase is actually in, or the user re-runs it and double-receives.
        toast.error(
          recibida
            ? `La mercancía SÍ entró, pero la nota de crédito falló: ${msg}. ` +
                `Regístrala a mano en Finanzas por ${formatMXN(falta)}.`
            : msg,
        );
        if (recibida) router.refresh();
      }
    });
  }

  function cancelar() {
    setConfirmarCancelar(
      compra.estado === "recibida"
        ? "Esto devolverá al inventario todo lo que entró con esta factura."
        : "La compra quedará cancelada y no se podrá recibir.",
    );
  }

  function hacerCancelacion() {
    setConfirmarCancelar(null);
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
            {/* Always available: the purchase is a document whether it is a
                draft, received or cancelled — the PDF states which. */}
            <a href={`/api/compras/${compra.id}/pdf`} target="_blank" rel="noreferrer">
              <Button variant="secondary" disabled={pending}>
                <FileDown className="h-4 w-4" />
                PDF
              </Button>
            </a>
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
              ? "Falta capturar producto, o parte de la mercancía no llegó."
              : "Lo capturado excede el total de la factura."}
          </p>
        )}
        {!cuadra && (
          <a
            href={`/api/compras/${compra.id}/contra-recibo`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex"
          >
            <Button variant="secondary" size="sm">
              <FileDown className="h-4 w-4" />
              Contra recibo (PDF)
            </Button>
          </a>
        )}
        {cuadra && papel > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Lo capturado coincide con la factura.
          </p>
        )}
      </Card>

      {/* Captura desde archivo — antes del alta manual, porque es el camino
          rápido y el manual queda como el de una línea suelta. */}
      {editable && <CargarFactura compraId={compra.id} />}

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

      <ConfirmDialog
        open={confirmarRecibo}
        onClose={() => setConfirmarRecibo(false)}
        onConfirm={hacerRecibo}
        title="Lo capturado no cuadra con la factura"
        confirmLabel="Recibir sin nota"
        loading={pending}
        extra={
          diferencia > 0 ? (
            <Button variant="accent" onClick={notaYRecibir} disabled={pending}>
              Registrar nota y recibir
            </Button>
          ) : undefined
        }
        description={
          diferencia > 0
            ? "Llegó menos de lo que dice la factura. Si no lo registras como nota de crédito, el proveedor te va a seguir cobrando esa diferencia."
            : "Lo capturado excede el total de la factura. Revisa las cantidades antes de recibir."
        }
      >
        <div className="space-y-1.5 rounded-lg border border-border p-3 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Dice la factura</span>
            <span className="tabular-nums">{formatMXN(papel)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Capturado ({piezas} piezas)</span>
            <span className="tabular-nums">{formatMXN(capturado)}</span>
          </div>
          <div className="flex justify-between gap-2 border-t border-border pt-1.5 font-medium">
            <span>Diferencia</span>
            <span className="tabular-nums text-amber-600 dark:text-amber-400">
              {formatMXN(Math.abs(diferencia))}
            </span>
          </div>
        </div>
        {diferencia > 0 && (
          <p className="text-xs text-muted-foreground">
            Con la nota: a crédito quedas debiendo sólo {formatMXN(capturado)}. Si ya
            pagaste la factura completa, la diferencia te queda como saldo a favor con
            este proveedor.
          </p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmarCancelar !== null}
        onClose={() => setConfirmarCancelar(null)}
        onConfirm={hacerCancelacion}
        title="Cancelar la compra"
        description={confirmarCancelar}
        confirmLabel="Sí, cancelar"
        cancelLabel="No"
        tone="danger"
        loading={pending}
      />
    </div>
  );
}
