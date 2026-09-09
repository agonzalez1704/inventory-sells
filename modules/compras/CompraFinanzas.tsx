"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, ReceiptText, Banknote } from "lucide-react";
import { formatMXN, fromCents } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/use-confirm";
import { Input, Select } from "@/components/ui/input";
import { AdjuntarImagen } from "@/components/ui/adjuntar-imagen";
import { ExternalLink } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import {
  registrarNota,
  registrarPago,
  borrarPago,
  type Compra,
  type CompraItem,
  type NotaCredito,
  type Pago,
  type Saldo,
  type NotaTipo,
  type MetodoPago,
} from "./actions";

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });

const TIPO_LABEL: Record<NotaTipo, string> = {
  no_llego: "No llegó",
  devolucion: "Devolución",
  descuento: "Descuento",
};
const METODO_LABEL: Record<MetodoPago, string> = {
  transferencia: "Transferencia",
  cheque: "Cheque",
  efectivo: "Efectivo",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function CompraFinanzas({
  compra,
  saldo,
  notas,
  pagos,
}: {
  compra: Compra;
  saldo: Saldo;
  notas: NotaCredito[];
  pagos: Pago[];
}) {
  const [nuevaNota, setNuevaNota] = useState(false);
  const [nuevoPago, setNuevoPago] = useState(false);
  const recibida = compra.estado === "recibida";
  const liquidada = saldo.saldo_cents <= 0;

  return (
    <div className="space-y-5">
      {/* La cuenta: documento − notas − pagos */}
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Documento</p>
            <p className="text-lg font-semibold tabular-nums">{formatMXN(saldo.base_cents)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Notas de crédito</p>
            <p className="text-lg font-semibold tabular-nums">−{formatMXN(saldo.notas_cents)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pagado</p>
            <p className="text-lg font-semibold tabular-nums">−{formatMXN(saldo.pagado_cents)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Por pagar</p>
            <p
              className={`text-lg font-semibold tabular-nums ${
                liquidada ? "text-emerald-600 dark:text-emerald-400" : ""
              }`}
            >
              {liquidada ? "Liquidada" : formatMXN(saldo.saldo_cents)}
            </p>
          </div>
        </div>
      </Card>

      {/* Notas de crédito */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <ReceiptText className="h-4 w-4" />
            Notas de crédito
          </p>
          {recibida && (
            <Button variant="ghost" size="sm" onClick={() => setNuevaNota(true)}>
              <Plus className="h-4 w-4" />
              Agregar
            </Button>
          )}
        </div>
        {notas.length === 0 ? (
          <p className="px-4 py-5 text-center text-sm text-muted-foreground">
            {recibida
              ? "Sin notas. Registra aquí lo que no llegó o se devolvió."
              : "Disponible cuando recibas la mercancía."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {notas.map((n) => (
              <li key={n.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={n.tipo === "descuento" ? "neutral" : "warning"}>
                        {TIPO_LABEL[n.tipo]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{fecha(n.fecha)}</span>
                    </div>
                    {n.motivo && <p className="mt-1 text-sm">{n.motivo}</p>}
                    {(n.compra_nota_items ?? []).map((i) => (
                      <p key={i.id} className="mt-0.5 text-xs text-muted-foreground">
                        {i.products?.name} · {i.qty} × {formatMXN(i.costo_unitario_cents)}
                      </p>
                    ))}
                  </div>
                  <p className="shrink-0 tabular-nums">−{formatMXN(n.monto_cents)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Pagos */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Banknote className="h-4 w-4" />
            Pagos
          </p>
          {recibida && !liquidada && (
            <Button variant="ghost" size="sm" onClick={() => setNuevoPago(true)}>
              <Plus className="h-4 w-4" />
              Registrar pago
            </Button>
          )}
        </div>
        {pagos.length === 0 ? (
          <p className="px-4 py-5 text-center text-sm text-muted-foreground">
            {recibida ? "Sin pagos registrados." : "Disponible cuando recibas la mercancía."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {pagos.map((p) => (
              <PagoRow key={p.id} pago={p} />
            ))}
          </ul>
        )}
      </Card>

      {nuevaNota && (
        <NotaModal compra={compra} onClose={() => setNuevaNota(false)} />
      )}
      {nuevoPago && (
        <PagoModal
          compraId={compra.id}
          sugerido={fromCents(saldo.saldo_cents)}
          items={compra.compra_items ?? []}
          onClose={() => setNuevoPago(false)}
        />
      )}
    </div>
  );
}

function PagoRow({ pago }: { pago: Pago }) {
  const [confirmar, dialogoConfirm] = useConfirm();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      {dialogoConfirm}
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          {METODO_LABEL[pago.metodo]}
          {pago.referencia && (
            <span className="ml-2 text-xs text-muted-foreground">{pago.referencia}</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {fecha(pago.fecha)}
          {pago.detalle && pago.detalle.length > 0 && (
            <span className="ml-2">· cubre {pago.detalle.length} partida{pago.detalle.length > 1 ? "s" : ""}</span>
          )}
          {pago.imagen_url && (
            <a
              href={pago.imagen_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 inline-flex items-center gap-0.5 font-medium text-brand-foreground hover:underline"
            >
              Ver captura <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </p>
      </div>
      <p className="shrink-0 tabular-nums">{formatMXN(pago.monto_cents)}</p>
      <button
        onClick={async () => {
          if (!(await confirmar({ title: "¿Borrar este pago?", confirmLabel: "Borrar", tone: "danger" })))
            return;
          start(async () => {
            try {
              await borrarPago(pago.id);
              router.refresh();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Error");
            }
          });
        }}
        disabled={pending}
        aria-label="Borrar pago"
        className="shrink-0 cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-red-600 dark:hover:text-red-400"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}

function NotaModal({ compra, onClose }: { compra: Compra; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tipo, setTipo] = useState<NotaTipo>("no_llego");
  const [motivo, setMotivo] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [monto, setMonto] = useState("");

  const items = compra.compra_items ?? [];
  const conMercancia = tipo !== "descuento";
  const elegido = items.find((i) => i.product_id === productId);

  function guardar() {
    start(async () => {
      try {
        await registrarNota({
          compraId: compra.id,
          tipo,
          motivo: motivo || null,
          items:
            conMercancia && elegido
              ? [
                  {
                    product_id: elegido.product_id,
                    qty: parseInt(qty, 10) || 0,
                    costo_unitario_cents: elegido.costo_unitario_cents,
                  },
                ]
              : [],
          montoPesos: conMercancia ? null : parseFloat(monto.replace(",", ".")) || null,
        });
        toast.success("Nota de crédito registrada");
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al registrar");
      }
    });
  }

  const valido = conMercancia
    ? !!elegido && (parseInt(qty, 10) || 0) > 0
    : (parseFloat(monto.replace(",", ".")) || 0) > 0;

  return (
    <Modal open onClose={onClose} title="Nota de crédito" className="max-w-md">
      <div className="space-y-3">
        <Field label="Tipo">
          <Select value={tipo} onChange={(e) => setTipo(e.target.value as NotaTipo)}>
            <option value="no_llego">No llegó (baja del inventario)</option>
            <option value="devolucion">Devolución (baja del inventario)</option>
            <option value="descuento">Descuento comercial (solo dinero)</option>
          </Select>
        </Field>

        {conMercancia ? (
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Field label="Producto de esta factura">
                <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
                  <option value="">Elige…</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.product_id}>
                      {i.products?.name} ({i.qty} facturadas)
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Cantidad">
              <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" />
            </Field>
          </div>
        ) : (
          <Field label="Importe (pesos)">
            <Input
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
            />
          </Field>
        )}

        {conMercancia && elegido && (
          <p className="text-xs text-muted-foreground">
            Se descontarán {qty || 0} × {formatMXN(elegido.costo_unitario_cents)} ={" "}
            <span className="font-medium">
              {formatMXN((parseInt(qty, 10) || 0) * elegido.costo_unitario_cents)}
            </span>{" "}
            y saldrán del inventario.
          </p>
        )}

        <Field label="Motivo (opcional)">
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Faltó en el embarque, pieza dañada…"
          />
        </Field>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={guardar} loading={pending} disabled={!valido}>
            Registrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function PagoModal({
  compraId,
  sugerido,
  items,
  onClose,
}: {
  compraId: string;
  sugerido: number;
  items: CompraItem[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [monto, setMonto] = useState(String(sugerido));
  const [metodo, setMetodo] = useState<MetodoPago>("transferencia");
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().slice(0, 10));
  const [referencia, setReferencia] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  // Per-line amounts, as typed. When any is set, the payment amount IS their
  // sum — that is the whole point of itemizing.
  const [partidas, setPartidas] = useState<Record<string, string>>({});

  const partidasActivas = Object.entries(partidas)
    .map(([itemId, v]) => ({ itemId, montoPesos: parseFloat(v.replace(",", ".")) || 0 }))
    .filter((pt) => pt.montoPesos > 0);
  const sumaPartidas = partidasActivas.reduce((a, pt) => a + pt.montoPesos, 0);
  const montoFinal = partidasActivas.length > 0 ? sumaPartidas : parseFloat(monto.replace(",", ".")) || 0;

  function guardar() {
    start(async () => {
      try {
        let form: FormData | undefined;
        if (foto) {
          form = new FormData();
          form.append("file", foto);
        }
        await registrarPago(
          {
            compraId,
            montoPesos: montoFinal,
            metodo,
            fecha: fechaPago,
            referencia: referencia || null,
            notas: null,
            partidas: partidasActivas,
          },
          form,
        );
        toast.success("Pago registrado");
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al registrar");
      }
    });
  }

  return (
    <Modal open onClose={onClose} title="Registrar pago" className="max-w-md">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Monto (pesos)">
            <Input
              value={partidasActivas.length > 0 ? sumaPartidas.toFixed(2) : monto}
              onChange={(e) => setMonto(e.target.value)}
              readOnly={partidasActivas.length > 0}
              inputMode="decimal"
            />
          </Field>
          <Field label="Método">
            <Select value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
              <option value="transferencia">Transferencia</option>
              <option value="cheque">Cheque</option>
              <option value="efectivo">Efectivo</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Fecha">
            <Input
              type="date"
              value={fechaPago}
              onChange={(e) => setFechaPago(e.target.value)}
            />
          </Field>
          <Field label="Referencia (opcional)">
            <Input
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Folio del cheque, SPEI…"
            />
          </Field>
        </div>
        <Field label="Comprobante (opcional)">
          <AdjuntarImagen value={foto} onChange={setFoto} />
        </Field>

        {items.length > 0 && (
          <div className="rounded-xl border border-border p-3">
            <p className="text-xs font-medium text-muted-foreground">
              ¿Qué partidas cubre este pago? (opcional) — al llenar montos, el
              pago se vuelve su suma exacta.
            </p>
            <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
              {items.map((it) => {
                const costoLinea = it.costo_unitario_cents * it.qty;
                const venta = it.products?.price_cents ?? 0;
                const repartoLinea =
                  venta > it.costo_unitario_cents
                    ? (it.costo_unitario_cents + Math.round((venta - it.costo_unitario_cents) / 2)) * it.qty
                    : costoLinea;
                const pagado = it.pagado_cents ?? 0;
                const liquidada = pagado >= repartoLinea && repartoLinea > 0;
                return (
                  <li key={it.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        {it.qty}× {it.products?.name ?? it.products?.sku ?? "—"}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {liquidada ? (
                          <span className="font-medium text-green-600 dark:text-green-400">Pagada</span>
                        ) : (
                          <>
                            {pagado > 0 && <>pagado {formatMXN(pagado)} · </>}
                            <button
                              type="button"
                              className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-foreground"
                              onClick={() =>
                                setPartidas((prev) => ({
                                  ...prev,
                                  [it.id]: String(fromCents(Math.max(0, costoLinea - pagado))),
                                }))
                              }
                            >
                              costo {formatMXN(costoLinea)}
                            </button>
                            {repartoLinea !== costoLinea && (
                              <>
                                {" · "}
                                <button
                                  type="button"
                                  className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-foreground"
                                  onClick={() =>
                                    setPartidas((prev) => ({
                                      ...prev,
                                      [it.id]: String(fromCents(Math.max(0, repartoLinea - pagado))),
                                    }))
                                  }
                                >
                                  con reparto 50% {formatMXN(repartoLinea)}
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </span>
                    </span>
                    <Input
                      value={partidas[it.id] ?? ""}
                      onChange={(e) =>
                        setPartidas((prev) => ({ ...prev, [it.id]: e.target.value }))
                      }
                      inputMode="decimal"
                      placeholder="0"
                      className="h-8 w-24 text-right"
                    />
                  </li>
                );
              })}
            </ul>
            {partidasActivas.length > 0 && (
              <p className="mt-2 text-right text-xs font-medium">
                Suma de partidas: <span className="tabular-nums">{formatMXN(Math.round(sumaPartidas * 100))}</span>
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={guardar} loading={pending} disabled={montoFinal <= 0}>
            Registrar {montoFinal > 0 ? formatMXN(Math.round(montoFinal * 100)) : ""}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
