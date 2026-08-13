"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { unwrap } from "@/lib/errors";
import { Modal } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { SaleWithItems } from "@/modules/sales/RecentSales";
import { BuscarVenta } from "./BuscarVenta";
import {
  registrarGarantia,
  lineasDeVenta,
  type ResolucionGarantia,
  type LineaVenta,
  type VentaGarantia,
} from "./cliente-actions";

// One part per claim. A warranty is a statement about a specific piece that
// failed — bundling several into one record would leave the shop unable to say
// which of them the supplier owes for.
/**
 * Two entry points, one modal.
 *
 * From a sale (the Garantía button on /ventas) it opens straight on the form.
 * Without one it starts on the search, because the usual case is a customer
 * walking in with a part and no idea which sale it came from.
 */
export function GarantiaModal({
  sale,
  onClose,
}: {
  /** Omitted when the operator has to find the sale first. */
  sale?: SaleWithItems;
  onClose: () => void;
}) {
  const [elegida, setElegida] = useState<VentaGarantia | null>(null);
  const [lineasBuscadas, setLineasBuscadas] = useState<LineaVenta[]>([]);
  const [cargandoLineas, setCargandoLineas] = useState(false);

  const saleId = sale?.id ?? elegida?.id ?? null;
  const nombreCliente = sale?.customer_name ?? elegida?.customer_name ?? null;

  // Only when the sale came from the search — one already in hand carries its
  // own lines.
  useEffect(() => {
    if (!elegida) return;
    let cancelado = false;
    setCargandoLineas(true);
    lineasDeVenta(elegida.id)
      .then((l) => !cancelado && setLineasBuscadas(l))
      .catch(() => {})
      .finally(() => !cancelado && setCargandoLineas(false));
    return () => {
      cancelado = true;
    };
  }, [elegida]);

  const router = useRouter();
  const [pending, start] = useTransition();

  const lineas = useMemo(
    () =>
      sale
        ? sale.sale_items
            .filter((it) => it.product_id)
            .map((it) => ({
              product_id: it.product_id as string,
              nombre: it.products?.name ?? "Producto",
              sku: it.products?.sku ?? "",
              sold: it.qty,
              unit: it.unit_price_cents,
            }))
        : lineasBuscadas.map((l) => ({
            product_id: l.product_id,
            nombre: l.nombre,
            sku: l.sku,
            sold: l.qty,
            unit: l.unit_price_cents,
          })),
    [sale, lineasBuscadas],
  );

  const [productId, setProductId] = useState("");
  // The lines arrive after the sale is picked, so the default cannot be seeded
  // at mount. Only fills an empty choice — never overrides the operator's.
  useEffect(() => {
    setProductId((p) => (p && lineas.some((l) => l.product_id === p) ? p : lineas[0]?.product_id ?? ""));
  }, [lineas]);
  const [qty, setQty] = useState(1);
  const [motivo, setMotivo] = useState("");
  // No default: the operator has to say whether the part is still sellable.
  // A failed part put back on the shelf is sold again and comes back again.
  const [reingresa, setReingresa] = useState<boolean | null>(null);
  const [resolucion, setResolucion] = useState<ResolucionGarantia | "">("");

  const linea = lineas.find((l) => l.product_id === productId);
  const monto = (linea?.unit ?? 0) * qty;

  function guardar() {
    if (!saleId || !linea) return toast.error("Elige la pieza");
    if (reingresa === null) return toast.error("Falta decir si la pieza sirve");
    start(async () => {
      try {
        unwrap(
          await registrarGarantia(
            saleId!,
            linea.product_id,
            qty,
            motivo || null,
            reingresa,
            resolucion || null,
          ),
        );
        toast.success(
          resolucion === "saldo"
            ? `Garantía registrada · ${formatMXN(monto)} de saldo a favor`
            : "Garantía registrada",
        );
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo registrar");
      }
    });
  }

  return (
    <Modal open onClose={onClose} title="Garantía de cliente" className="max-w-lg">
      {!saleId ? (
        <BuscarVenta onElegir={setElegida} />
      ) : (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Queda ligada a esta venta{nombreCliente ? ` de ${nombreCliente}` : ""}.
          Se valúa a lo que el cliente pagó ese día, no al precio de hoy.
        </p>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Pieza</span>
          <Select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            disabled={cargandoLineas}
          >
            {cargandoLineas && <option>Cargando piezas…</option>}
            {lineas.map((l) => (
              <option key={l.product_id} value={l.product_id}>
                {l.sku} · {l.nombre} — {formatMXN(l.unit)} c/u
              </option>
            ))}
          </Select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Piezas (vendidas: {linea?.sold ?? 0})
            </span>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={linea?.sold ?? 1}
              value={qty}
              onChange={(e) =>
                setQty(Math.max(1, Math.min(Number(e.target.value) || 1, linea?.sold ?? 1)))
              }
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Monto</span>
            <div className="flex h-10 items-center rounded-lg border border-border px-3 font-mono text-sm tabular-nums">
              {formatMXN(monto)}
            </div>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Motivo</span>
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Falló a los 3 días, no encendió…"
          />
        </label>

        {/* The one question with no safe default. */}
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-muted-foreground">
            ¿La pieza se puede volver a vender?
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                [false, "No sirve", "Sale del inventario y queda para el reclamo al proveedor."],
                [true, "Sí sirve", "Vuelve a existencias — modelo equivocado, no le quedó."],
              ] as const
            ).map(([v, titulo, detalle]) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setReingresa(v)}
                className={cn(
                  "cursor-pointer rounded-lg border p-3 text-left transition-colors",
                  reingresa === v ? "border-ring bg-muted" : "border-border hover:border-ring/40",
                )}
              >
                <span className="block text-sm font-medium">{titulo}</span>
                <span className="block text-xs text-muted-foreground">{detalle}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            ¿Cómo se resuelve?
          </span>
          <Select
            value={resolucion}
            onChange={(e) => setResolucion(e.target.value as ResolucionGarantia | "")}
          >
            <option value="">Dejar pendiente</option>
            <option value="saldo">Saldo a favor</option>
            <option value="cambio">Cambio físico</option>
            <option value="efectivo">Devolución en efectivo</option>
          </Select>
          {resolucion === "saldo" && (
            <span className="mt-1.5 block text-xs text-muted-foreground">
              Se abonan {formatMXN(monto)} al cliente para su próxima compra.
            </span>
          )}
          {resolucion === "efectivo" && (
            <span className="mt-1.5 block text-xs text-amber-700 dark:text-amber-300">
              Esto solo deja el registro. El dinero se entrega con una devolución
              aparte, para que salga en el corte del día.
            </span>
          )}
        </label>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={guardar} loading={pending}>
            Registrar garantía
          </Button>
        </div>
      </div>
      )}
    </Modal>
  );
}
