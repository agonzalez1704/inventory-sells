"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, Truck, Phone, User, Pencil, Archive, Clock, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  crearProveedor,
  editarProveedor,
  archivarProveedor,
  type Proveedor,
  type ProveedorInput,
} from "./actions";

// A supplier's lead time is what the customer actually waits for a part we
// don't hold — say it in words, not a raw number.
export function entregaTexto(dias: number): string {
  if (dias <= 0) return "En existencia";
  if (dias === 1) return "1 día";
  return `${dias} días`;
}

export function ProveedoresView({
  initial,
  conteo,
  puedeGestionar,
}: {
  initial: Proveedor[];
  conteo: Record<string, number>;
  puedeGestionar: boolean;
}) {
  const [query, setQuery] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const [editar, setEditar] = useState<Proveedor | null>(null);
  const [verArchivados, setVerArchivados] = useState(false);

  const { activos, archivados } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    const match = (p: Proveedor) => {
      if (!tokens.length) return true;
      const hay = `${p.nombre} ${p.telefono ?? ""} ${p.contacto ?? ""}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    };
    return {
      activos: initial.filter((p) => p.is_active && match(p)),
      archivados: initial.filter((p) => !p.is_active && match(p)),
    };
  }, [initial, query]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Proveedores</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {activos.length} {activos.length === 1 ? "proveedor" : "proveedores"} · tiempos de
            entrega por pieza
          </p>
        </div>
        {puedeGestionar && (
          <Button onClick={() => setNuevo(true)}>
            <Plus className="h-4 w-4" />
            Nuevo proveedor
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre, contacto o teléfono…"
          className="h-10 pl-9"
        />
      </div>

      {activos.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={initial.length === 0 ? "Sin proveedores" : "Sin resultados"}
          description={
            initial.length === 0
              ? "Registra a quién le compras para saber en cuánto llega cada pieza."
              : "Prueba con otro nombre."
          }
        />
      ) : (
        <div className="space-y-2.5">
          {activos.map((p) => (
            <ProveedorRow
              key={p.id}
              p={p}
              productos={conteo[p.id] ?? 0}
              puedeGestionar={puedeGestionar}
              onEdit={() => setEditar(p)}
            />
          ))}
        </div>
      )}

      {archivados.length > 0 && (
        <div className="space-y-2.5">
          <button
            onClick={() => setVerArchivados((v) => !v)}
            className="cursor-pointer text-sm text-muted-foreground hover:text-foreground"
          >
            {verArchivados ? "Ocultar" : "Ver"} archivados ({archivados.length})
          </button>
          {verArchivados &&
            archivados.map((p) => (
              <ProveedorRow
                key={p.id}
                p={p}
                productos={conteo[p.id] ?? 0}
                puedeGestionar={puedeGestionar}
                onEdit={() => setEditar(p)}
              />
            ))}
        </div>
      )}

      {nuevo && <ProveedorModal onClose={() => setNuevo(false)} />}
      {editar && <ProveedorModal proveedor={editar} onClose={() => setEditar(null)} />}
    </section>
  );
}

function ProveedorRow({
  p,
  productos,
  puedeGestionar,
  onEdit,
}: {
  p: Proveedor;
  productos: number;
  puedeGestionar: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function archivar() {
    const msg = p.is_active
      ? `¿Archivar a ${p.nombre}? Sus productos conservan la referencia.`
      : `¿Reactivar a ${p.nombre}?`;
    if (!confirm(msg)) return;
    start(async () => {
      try {
        await archivarProveedor(p.id, !p.is_active);
        toast.success(p.is_active ? "Proveedor archivado" : "Proveedor reactivado");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error");
      }
    });
  }

  return (
    <Card className={`p-4 ${p.is_active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{p.nombre}</p>
            <Badge tone={p.lead_time_dias > 0 ? "warning" : "accent"}>
              <Clock className="mr-1 inline h-3 w-3" />
              {entregaTexto(p.lead_time_dias)}
            </Badge>
            {!p.is_active && <Badge tone="neutral">Archivado</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {p.telefono && (
              <a
                href={`https://wa.me/${p.telefono.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <Phone className="h-3.5 w-3.5" />
                {p.telefono}
              </a>
            )}
            {p.contacto && (
              <span className="inline-flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                {p.contacto}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Package className="h-3.5 w-3.5" />
              {productos} {productos === 1 ? "producto" : "productos"}
            </span>
          </div>
          {p.notas && <p className="mt-1.5 text-xs text-muted-foreground">{p.notas}</p>}
        </div>
        {puedeGestionar && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onEdit} disabled={pending}>
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
            <button
              onClick={archivar}
              disabled={pending}
              aria-label={p.is_active ? "Archivar proveedor" : "Reactivar proveedor"}
              className="shrink-0 cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Archive className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

function ProveedorModal({
  proveedor,
  onClose,
}: {
  proveedor?: Proveedor;
  onClose: () => void;
}) {
  const router = useRouter();
  const esEdit = !!proveedor;
  const [nombre, setNombre] = useState(proveedor?.nombre ?? "");
  const [telefono, setTelefono] = useState(proveedor?.telefono ?? "");
  const [contacto, setContacto] = useState(proveedor?.contacto ?? "");
  const [dias, setDias] = useState(String(proveedor?.lead_time_dias ?? 0));
  const [notas, setNotas] = useState(proveedor?.notas ?? "");
  const [pending, start] = useTransition();

  function save() {
    const d = parseInt(dias, 10);
    if (!nombre.trim()) return toast.error("Falta el nombre");
    if (!Number.isFinite(d) || d < 0 || d > 120)
      return toast.error("Tiempo de entrega inválido (0 a 120 días)");

    const payload: ProveedorInput = {
      nombre,
      telefono: telefono || null,
      contacto: contacto || null,
      lead_time_dias: d,
      notas: notas || null,
    };
    start(async () => {
      try {
        if (esEdit) await editarProveedor(proveedor!.id, payload);
        else await crearProveedor(payload);
        toast.success(esEdit ? "Proveedor actualizado" : "Proveedor registrado");
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al guardar");
      }
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={esEdit ? "Editar proveedor" : "Nuevo proveedor"}
      className="max-w-md"
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Nombre</span>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Distribuidora del Centro"
            autoFocus
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Teléfono (opcional)
            </span>
            <Input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              inputMode="tel"
              placeholder="55 1234 5678"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Contacto (opcional)
            </span>
            <Input
              value={contacto}
              onChange={(e) => setContacto(e.target.value)}
              placeholder="Nombre de quien atiende"
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Tiempo de entrega (días)
          </span>
          <Input
            value={dias}
            onChange={(e) => setDias(e.target.value)}
            inputMode="numeric"
            placeholder="0"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            0 = lo tenemos aquí. 2 = tarda 2 días en llegar de su almacén.
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Notas (opcional)
          </span>
          <Input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Días de visita, condiciones de pago…"
          />
        </label>
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={save} loading={pending}>
            {esEdit ? "Guardar" : "Registrar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
