"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Inventory } from "@/lib/types";
import { editarInventario } from "./inventories";
import { listarSucursales, type Sucursal } from "@/modules/sucursales/actions";

/**
 * The inventory itself: name, city, delivery lead. Three fields — creating
 * products has its own flows, and deleting a warehouse with stock in it is a
 * decision this modal refuses to make casual.
 */
export function EditarInventarioModal({
  inventario,
  onClose,
}: {
  inventario: Inventory;
  onClose: () => void;
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState(inventario.name);
  const [ciudad, setCiudad] = useState(inventario.ciudad ?? "");
  const [dias, setDias] = useState(
    inventario.entrega_dias_habiles != null ? String(inventario.entrega_dias_habiles) : "",
  );
  const [dropship, setDropship] = useState(inventario.es_dropship ?? false);
  const [sucursalId, setSucursalId] = useState<string>(inventario.sucursal_id ?? "");
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  useEffect(() => {
    listarSucursales().then(setSucursales).catch(() => undefined);
  }, []);
  const [pending, start] = useTransition();

  function guardar() {
    start(async () => {
      try {
        await editarInventario(inventario.id, {
          nombre,
          ciudad: ciudad.trim() || null,
          entregaDias: dias.trim() === "" ? null : Number(dias),
          esDropship: dropship,
          sucursalId: sucursalId || null,
        });
        toast.success("Inventario guardado");
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo guardar");
      }
    });
  }

  return (
    <Modal open onClose={onClose} title="Editar inventario" className="max-w-sm">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
      >
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Nombre</span>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Ciudad (si no está en la tienda)
          </span>
          <Input value={ciudad} onChange={(e) => setCiudad(e.target.value)} placeholder="Irapuato" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Días hábiles extra de entrega
          </span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={dias}
            onChange={(e) => setDias(e.target.value)}
            placeholder="Vacío = local, sin días extra"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Los días se suman a la entrega estimada de todo pedido que incluya
          piezas de este inventario, y la tienda lo dice en cada pieza.
        </p>
        {sucursales.length > 0 && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Sucursal física
            </span>
            <select
              value={sucursalId}
              onChange={(e) => setSucursalId(e.target.value)}
              className="h-10 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
            >
              <option value="">Sin sucursal — se vende desde cualquiera</option>
              {sucursales.map((su) => (
                <option key={su.id} value={su.id}>{su.nombre}</option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted-foreground">
              Con sucursal, solo quien registró su entrada ahí puede vender este
              inventario.
            </span>
          </label>
        )}
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={dropship}
            onChange={(e) => setDropship(e.target.checked)}
            className="mt-0.5 h-4 w-4 cursor-pointer accent-[hsl(var(--accent))]"
          />
          <span>
            Dropship
            <span className="block text-xs text-muted-foreground">
              El proveedor envía directo al cliente. Sus productos se venden sin
              stock propio y no reservan inventario.
            </span>
          </span>
        </label>
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending} disabled={!nombre.trim()}>
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
