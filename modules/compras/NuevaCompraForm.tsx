"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import type { Proveedor } from "@/modules/proveedores/actions";
import { crearCompra, type Condicion } from "./actions";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const hoy = () => new Date().toISOString().slice(0, 10);

export function NuevaCompraForm({ proveedores }: { proveedores: Proveedor[] }) {
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

  function guardar() {
    if (!proveedorId) return toast.error("Elige el proveedor");
    start(async () => {
      try {
        const { id } = await crearCompra({
          proveedor_id: proveedorId,
          folio_factura: folio || null,
          fecha_ingreso: fecha,
          condicion,
          dias_credito: parseInt(dias, 10) || 0,
          pronto_pago: prontoPago,
          pronto_pago_pct: prontoPago ? parseFloat(ppPct) || null : null,
          pronto_pago_dias: prontoPago ? parseInt(ppDias, 10) || null : null,
          total_factura: parseFloat(total.replace(",", ".")) || 0,
          notas: notas || null,
        });
        toast.success("Compra creada — ahora agrega los productos");
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

  return (
    <Card className="space-y-4 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Proveedor">
          <Select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Folio de la factura">
          <Input value={folio} onChange={(e) => setFolio(e.target.value)} placeholder="A-12345" />
        </Field>
        <Field label="Fecha de ingreso">
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>
        <Field label="Total de la factura (pesos)">
          <Input
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Lo que dice el papel. Se compara con lo que captures.
          </span>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Condición">
          <Select
            value={condicion}
            onChange={(e) => setCondicion(e.target.value as Condicion)}
          >
            <option value="contado">Contado</option>
            <option value="credito">Crédito</option>
          </Select>
        </Field>
        {condicion === "credito" && (
          <Field label="Días de crédito">
            <Input
              value={dias}
              onChange={(e) => setDias(e.target.value)}
              inputMode="numeric"
              placeholder="30"
            />
          </Field>
        )}
      </div>

      <div className="rounded-lg border border-border p-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={prontoPago}
            onChange={(e) => setProntoPago(e.target.checked)}
          />
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
        <p className="mt-2 text-xs text-muted-foreground">
          Solo queda anotado como referencia; el sistema no lo descuenta solo.
        </p>
      </div>

      <Field label="Notas (opcional)">
        <Input
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Observaciones de la factura…"
        />
      </Field>

      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button variant="ghost" onClick={() => router.push("/compras")} disabled={pending}>
          Cancelar
        </Button>
        <Button onClick={guardar} loading={pending}>
          Crear y agregar productos
        </Button>
      </div>
    </Card>
  );
}
