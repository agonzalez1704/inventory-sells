"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileText, Sparkles, UploadCloud } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { unwrap } from "@/lib/errors";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Proveedor } from "@/modules/proveedores/actions";
import { crearCompra, type Condicion } from "./actions";
import { aplicarLineas, leerFacturaNueva, subirFactura, type LecturaFactura } from "./factura-actions";
import { FilaRevision, type Editable } from "./CargarFactura";

function Field({ label, leido, children }: { label: string; leido?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        {label}
        {leido && (
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-1.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900">
            <Sparkles className="h-2.5 w-2.5" />
            leído de la factura
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

const hoy = () => new Date().toISOString().slice(0, 10);
const dmy = (iso: string) => iso.split("-").reverse().join("/");
// Vercel refuses request bodies over 4.5 MB before our code runs.
const MAX_MB = 4.4;

/**
 * One step: drop the supplier's invoice and the header and the lines fill
 * themselves; review, create. Nothing is written until "Crear compra" — then
 * the purchase, its lines and the document go in, in that order. Typing it all
 * by hand still works: skip the upload.
 */
export function NuevaCompraForm({
  proveedores,
  inventarios,
}: {
  proveedores: Proveedor[];
  inventarios: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [proveedorId, setProveedorId] = useState(proveedores[0]?.id ?? "");
  const [folio, setFolio] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [condicion, setCondicion] = useState<Condicion>("contado");
  const [dias, setDias] = useState("30");
  const [prontoPago, setProntoPago] = useState(false);
  const [ppPct, setPpPct] = useState("2");
  const [ppDias, setPpDias] = useState("10");
  const [total, setTotal] = useState("");
  const [notas, setNotas] = useState("");
  const [inventarioId, setInventarioId] = useState(inventarios[0]?.id ?? "");

  const [archivo, setArchivo] = useState<File | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [lectura, setLectura] = useState<LecturaFactura | null>(null);
  const [lineas, setLineas] = useState<Editable[]>([]);

  const incluidas = lineas.filter((l) => l.incluir && l.productId);
  const suma = incluidas.reduce((s, l) => s + l.cantidad * (l.costo ?? 0), 0);
  const totalNum = parseFloat(total.replace(/,/g, "")) || 0;
  // Mexican invoices print lines before IVA and the total after it.
  const cuadra = totalNum > 0 && (Math.abs(suma * 1.16 - totalNum) < 1 || Math.abs(suma - totalNum) < 1);

  async function leer(file: File) {
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo es ${MAX_MB} MB.`);
      return;
    }
    setArchivo(file);
    setLeyendo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = unwrap(await leerFacturaNueva(fd, inventarioId));
      setLectura(r);
      setLineas(r.lineas.map((l) => ({ ...l, incluir: l.productId != null })));
      if (r.proveedorId) setProveedorId(r.proveedorId);
      if (r.folio) setFolio(r.folio);
      if (r.diasCredito) {
        setCondicion("credito");
        setDias(String(r.diasCredito));
      }
      if (r.total) setTotal(r.total.toFixed(2));
      if (r.lineas.length === 0) toast.error("No encontré piezas en el archivo");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo leer el archivo");
      setArchivo(null);
    } finally {
      setLeyendo(false);
    }
  }

  function quitarArchivo() {
    setArchivo(null);
    setLectura(null);
    setLineas([]);
  }

  function guardar() {
    if (!proveedorId) return toast.error("Elige el proveedor");
    start(async () => {
      try {
        const { id } = unwrap(
          await crearCompra({
            proveedor_id: proveedorId,
            folio_factura: folio || null,
            fecha_ingreso: fecha,
            condicion,
            dias_credito: parseInt(dias, 10) || 0,
            pronto_pago: prontoPago,
            pronto_pago_pct: prontoPago ? parseFloat(ppPct) || null : null,
            pronto_pago_dias: prontoPago ? parseInt(ppDias, 10) || null : null,
            total_factura: totalNum,
            notas: notas || null,
          }),
        );
        // The purchase exists from here on: whatever fails next is finished
        // on its page, so it never gets created twice.
        if (incluidas.length) {
          const r = await aplicarLineas(
            id,
            incluidas.map((l) => ({
              productId: l.productId!,
              cantidad: l.cantidad,
              costo: l.costo,
              pedido: l.pedido,
              skuProveedor: l.skuProveedor || undefined,
            })),
          );
          if (!r.ok) toast.error(`Compra creada, pero faltan las piezas: ${r.error}`);
        }
        if (archivo) {
          const fd = new FormData();
          fd.append("file", archivo);
          const up = await subirFactura(id, fd);
          if (!up.ok) toast.error(`Compra creada, pero no se guardó el archivo: ${up.error}`);
        }
        toast.success(incluidas.length ? `Compra creada con ${incluidas.length} líneas` : "Compra creada — agrega los productos");
        router.push(`/compras/${id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al crear");
      }
    });
  }

  if (proveedores.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Primero registra un proveedor para poder capturar su factura.
        </p>
        <Button className="mt-3" onClick={() => router.push("/proveedores")}>
          Ir a proveedores
        </Button>
      </Card>
    );
  }

  const leido = lectura?.modo === "documento";
  const sinProveedor = leido && !lectura.proveedorId && lectura.proveedorTexto;
  const dudosas = lineas.filter((l) => l.origen === "busqueda").length;
  const sinProducto = lineas.filter((l) => !l.productId).length;
  const piezas = incluidas.reduce((s, l) => s + l.cantidad, 0);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        {!archivo ? (
          <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed border-border px-4 py-7 text-center transition-colors hover:bg-muted/40">
            <UploadCloud className="h-7 w-7 text-muted-foreground" />
            <span className="text-[15px] font-semibold">Sube la factura del proveedor</span>
            <span className="text-xs text-muted-foreground">PDF, foto o la plantilla de Excel · arrástrala aquí o haz clic</span>
            <span className="text-xs text-muted-foreground">Se llenan proveedor, folio, crédito, total y las piezas. Nada se guarda hasta que lo revises.</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,application/pdf,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) leer(f);
                e.target.value = "";
              }}
            />
          </label>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-12 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300">
              <FileText className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{archivo.name}</p>
              <p className="text-xs text-muted-foreground">
                {(archivo.size / 1024).toFixed(0)} KB · se guarda con la compra
                {lectura?.fecha && ` · factura del ${dmy(lectura.fecha)}`}
              </p>
            </div>
            {leyendo ? (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-violet-600" />
                Leyendo la factura…
              </span>
            ) : (
              <Button variant="secondary" size="sm" onClick={quitarArchivo} disabled={pending}>
                Cambiar archivo
              </Button>
            )}
          </div>
        )}
      </Card>

      <Card className="space-y-4 p-4">
        {sinProveedor && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-600/25 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            La factura es de «{lectura.proveedorTexto}» y no está en tus proveedores con ese nombre. Elígelo abajo o regístralo primero.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Proveedor" leido={leido && !!lectura.proveedorId}>
            <Select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Folio de la factura" leido={leido && !!lectura.folio}>
            <Input value={folio} onChange={(e) => setFolio(e.target.value)} placeholder="A-12345" />
          </Field>
          <Field label="Fecha de ingreso">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Total de la factura (pesos)" leido={leido && !!lectura.total}>
            <Input value={total} onChange={(e) => setTotal(e.target.value)} inputMode="decimal" placeholder="0.00" />
            <span className="mt-1 block text-xs text-muted-foreground">
              Lo que dice el papel, con IVA. Se compara con las piezas.
            </span>
          </Field>
          <Field label="Condición" leido={leido && !!lectura.diasCredito}>
            <Select value={condicion} onChange={(e) => setCondicion(e.target.value as Condicion)}>
              <option value="contado">Contado</option>
              <option value="credito">Crédito</option>
            </Select>
          </Field>
          {condicion === "credito" && (
            <Field label="Días de crédito" leido={leido && !!lectura.diasCredito}>
              <Input value={dias} onChange={(e) => setDias(e.target.value)} inputMode="numeric" placeholder="30" />
            </Field>
          )}
          {inventarios.length > 1 && (
            <Field label="Entra a">
              <Select value={inventarioId} onChange={(e) => setInventarioId(e.target.value)} disabled={!!archivo}>
                {inventarios.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </Select>
              <span className="mt-1 block text-xs text-muted-foreground">
                {archivo ? "Las piezas se buscaron aquí. Para cambiarlo, cambia el archivo." : "Elígelo antes de subir la factura."}
              </span>
            </Field>
          )}
        </div>

        <div className="rounded-lg border border-border p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={prontoPago} onChange={(e) => setProntoPago(e.target.checked)} />
            Este proveedor da descuento por pronto pago
          </label>
          {prontoPago && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Descuento (%)">
                <Input value={ppPct} onChange={(e) => setPpPct(e.target.value)} inputMode="decimal" />
              </Field>
              <Field label="Si se paga en (días)">
                <Input value={ppDias} onChange={(e) => setPpDias(e.target.value)} inputMode="numeric" />
              </Field>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Solo queda anotado como referencia; el sistema no lo descuenta solo.</p>
        </div>

        <Field label="Notas (opcional)">
          <Input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Observaciones de la factura…" />
        </Field>
      </Card>

      {lectura && lineas.length > 0 && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-semibold">Piezas</p>
            <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700 ring-1 ring-green-200 dark:bg-green-950/40 dark:text-green-300 dark:ring-green-900">
              {lineas.length - sinProducto} de {lineas.length} encontradas
            </span>
          </div>
          {(dudosas > 0 || sinProducto > 0) && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-600/25 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {dudosas > 0 && `${dudosas} línea${dudosas === 1 ? "" : "s"} empataron por texto: revísalas. `}
              {sinProducto > 0 && `${sinProducto} sin producto: búscalo o se queda fuera. `}
            </p>
          )}
          <ul className="divide-y divide-border rounded-xl border border-border">
            {lineas.map((l, i) => (
              <FilaRevision
                key={`${l.ref}-${i}`}
                l={l}
                onChange={(p) => setLineas((cur) => cur.map((x, j) => (j === i ? { ...x, ...p } : x)))}
              />
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1 border-t border-border pt-3 text-sm tabular-nums">
            <span className="text-muted-foreground">
              Suma de piezas <b className="text-foreground">{formatMXN(Math.round(suma * 100))}</b>
            </span>
            <span className="text-muted-foreground">
              + IVA 16% <b className="text-foreground">{formatMXN(Math.round(suma * 116))}</b>
            </span>
            {totalNum > 0 &&
              (cuadra ? (
                <span className="flex items-center gap-1 font-semibold text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Cuadra con el total de la factura
                </span>
              ) : (
                <span className="font-semibold text-amber-700 dark:text-amber-300">
                  Diferencia con la factura: {formatMXN(Math.round((suma * 1.16 - totalNum) * 100))}
                </span>
              ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Corrige cantidades si algo no llegó. Las piezas entran al inventario cuando marques la compra como recibida.
          </p>
        </Card>
      )}

      <div className={cn("flex flex-wrap items-center justify-end gap-2", lectura && "sticky bottom-0 -mx-1 border-t border-border bg-background/95 px-1 py-3 backdrop-blur")}>
        {incluidas.length > 0 && (
          <span className="mr-auto text-sm text-muted-foreground">
            {incluidas.length} líneas · {piezas} piezas · <b className="text-foreground">{formatMXN(Math.round(suma * 116))}</b>
          </span>
        )}
        <Button variant="ghost" onClick={() => router.push("/compras")} disabled={pending}>
          Cancelar
        </Button>
        <Button onClick={guardar} loading={pending} disabled={leyendo}>
          {incluidas.length ? `Crear compra con ${incluidas.length} líneas` : "Crear y agregar productos"}
        </Button>
      </div>
    </div>
  );
}
