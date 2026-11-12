"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Inventory } from "@/lib/types";
import { editarInventario, eliminarInventario, marcaParaInventario } from "./inventories";
import { listarSucursales, type Sucursal } from "@/modules/sucursales/actions";
import type { Expres, RutaDia } from "@/modules/agent/reparto";
import { RutaExpres } from "./RutaExpres";

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
  const [ruta, setRuta] = useState<RutaDia[]>(inventario.ruta ?? []);
  const [expres, setExpres] = useState<Expres>({
    activo: inventario.expres_activo ?? false,
    dias: inventario.expres_dias ?? 1,
    corte: inventario.expres_corte ?? "16:00",
    costo: (inventario.expres_costo_cents ?? 0) / 100,
  });
  const [consulta, setConsulta] = useState(inventario.solo_consulta ?? false);
  const [sucursalId, setSucursalId] = useState<string>(inventario.sucursal_id ?? "");
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  useEffect(() => {
    listarSucursales().then(setSucursales).catch(() => undefined);
  }, []);
  const [pending, start] = useTransition();
  const [marca, setMarca] = useState("");
  const [borrar, setBorrar] = useState("");

  function ponerMarca() {
    start(async () => {
      const r = await marcaParaInventario(inventario.id, marca);
      if (!r.ok) return void toast.error(r.error);
      toast.success(`Marca "${marca.trim()}" puesta a todo ${inventario.name}`);
      setMarca("");
      router.refresh();
    });
  }

  function eliminar() {
    start(async () => {
      const r = await eliminarInventario(inventario.id);
      if (!r.ok) return void toast.error(r.error, { duration: 10_000 });
      toast.success(`"${inventario.name}" eliminado · ${r.data.productos.toLocaleString("es-MX")} productos`);
      onClose();
      router.refresh();
    });
  }

  function guardar() {
    start(async () => {
      try {
        await editarInventario(inventario.id, {
          nombre,
          ciudad: ciudad.trim() || null,
          entregaDias: dias.trim() === "" ? null : Number(dias),
          esDropship: dropship,
          sucursalId: sucursalId || null,
          soloConsulta: consulta,
          ruta,
          expres: { activo: expres.activo, dias: expres.dias, corte: expres.corte, costoCents: Math.round(expres.costo * 100) },
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
    <Modal open onClose={onClose} title="Editar inventario" className="max-w-md">
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
        <RutaExpres nombre={nombre} ruta={ruta} setRuta={setRuta} expres={expres} setExpres={setExpres} />
        {sucursales.length > 0 && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Sucursal física
            </span>
            <select
              value={sucursalId}
              onChange={(e) => setSucursalId(e.target.value)}
              className="h-10 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm outline-hidden focus:ring-2 focus:ring-ring/20"
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
            checked={consulta}
            onChange={(e) => setConsulta(e.target.checked)}
            className="mt-0.5 h-4 w-4 cursor-pointer accent-[hsl(var(--accent))]"
          />
          <span>
            De proveedor · solo consulta
            <span className="block text-xs text-muted-foreground">
              Se ve qué tiene el proveedor, pero no se vende de aquí: no sale en
              la tienda, el POS no lo cobra y no cuenta como existencia propia.
            </span>
          </span>
        </label>
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

      <div className="mt-4 space-y-2 border-t border-border pt-3">
        <span className="block text-xs font-medium text-muted-foreground">Marca para todos sus productos</span>
        <div className="flex gap-2">
          <Input value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="GROB" />
          <Button type="button" variant="secondary" onClick={ponerMarca} disabled={pending || !marca.trim()}>
            Aplicar
          </Button>
        </div>
        <span className="block text-xs text-muted-foreground">
          Reemplaza la marca de cada producto de este inventario.
        </span>
      </div>

      <div className="mt-4 space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-3 dark:border-red-900 dark:bg-red-950/20">
        <span className="block text-sm font-medium text-red-700 dark:text-red-400">Eliminar inventario</span>
        <span className="block text-xs text-muted-foreground">
          Borra el inventario y todos sus productos. Si alguna pieza tiene ventas, compras o
          cotizaciones no se borra nada. Escribe <b className="text-foreground">{inventario.name}</b> para confirmar.
        </span>
        <div className="flex gap-2">
          <Input value={borrar} onChange={(e) => setBorrar(e.target.value)} placeholder={inventario.name} />
          <Button
            type="button"
            variant="danger"
            onClick={eliminar}
            loading={pending}
            disabled={borrar.trim() !== inventario.name.trim()}
          >
            Eliminar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
