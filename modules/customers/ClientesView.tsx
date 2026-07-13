"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Users,
  Phone,
  Mail,
  Pencil,
  Archive,
  Percent,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  crearCliente,
  editarCliente,
  archivarCliente,
  type Customer,
  type CustomerInput,
  type CustomerTipo,
} from "./actions";

const TIPOS: [CustomerTipo, string][] = [
  ["publico", "Público"],
  ["mayoreo", "Mayoreo"],
  ["tecnico", "Técnico"],
];
const TIPO_LABEL = Object.fromEntries(TIPOS) as Record<CustomerTipo, string>;
const TIPO_TONE: Record<CustomerTipo, "neutral" | "accent" | "warning"> = {
  publico: "neutral",
  mayoreo: "accent",
  tecnico: "warning",
};

function pct(v: number | string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function ClientesView({ initial }: { initial: Customer[] }) {
  const [query, setQuery] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const [editar, setEditar] = useState<Customer | null>(null);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initial;
    const tokens = q.split(/\s+/).filter(Boolean);
    return initial.filter((c) => {
      const hay = `${c.nombre} ${c.telefono ?? ""} ${c.email ?? ""}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [initial, query]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {initial.length} {initial.length === 1 ? "cliente" : "clientes"} · precio
            especial y seguimiento
          </p>
        </div>
        <Button onClick={() => setNuevo(true)}>
          <Plus className="h-4 w-4" />
          Nuevo cliente
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre, teléfono o correo…"
          className="h-10 pl-9"
        />
      </div>

      {filtrados.length === 0 ? (
        <EmptyState
          icon={Users}
          title={initial.length === 0 ? "Sin clientes" : "Sin resultados"}
          description={
            initial.length === 0
              ? "Registra tu primer cliente para darle precio especial y llevar su seguimiento."
              : "Prueba con otro nombre o teléfono."
          }
        />
      ) : (
        <div className="space-y-2.5">
          {filtrados.map((c) => (
            <ClienteRow key={c.id} c={c} onEdit={() => setEditar(c)} />
          ))}
        </div>
      )}

      {nuevo && <ClienteModal onClose={() => setNuevo(false)} />}
      {editar && (
        <ClienteModal cliente={editar} onClose={() => setEditar(null)} />
      )}
    </section>
  );
}

function ClienteRow({ c, onEdit }: { c: Customer; onEdit: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const descuento = pct(c.descuento_pct);

  function archivar() {
    if (!confirm(`¿Archivar a ${c.nombre}? Se ocultará de la lista (su historial se conserva).`))
      return;
    start(async () => {
      try {
        await archivarCliente(c.id, false);
        toast.success("Cliente archivado");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al archivar");
      }
    });
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{c.nombre}</p>
            <Badge tone={TIPO_TONE[c.tipo]}>{TIPO_LABEL[c.tipo]}</Badge>
            {descuento > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                <Percent className="h-3 w-3" />
                {descuento}% desc.
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {c.telefono && (
              <a
                href={`https://wa.me/${c.telefono.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <Phone className="h-3.5 w-3.5" />
                {c.telefono}
              </a>
            )}
            {c.email && (
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                {c.email}
              </span>
            )}
          </div>
          {c.notas && (
            <p className="mt-1.5 text-xs text-muted-foreground">{c.notas}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit} disabled={pending}>
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
          <button
            onClick={archivar}
            disabled={pending}
            aria-label="Archivar cliente"
            className="shrink-0 cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-red-600"
          >
            <Archive className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Card>
  );
}

function ClienteModal({
  cliente,
  onClose,
}: {
  cliente?: Customer;
  onClose: () => void;
}) {
  const router = useRouter();
  const esEdit = !!cliente;
  const [nombre, setNombre] = useState(cliente?.nombre ?? "");
  const [telefono, setTelefono] = useState(cliente?.telefono ?? "");
  const [email, setEmail] = useState(cliente?.email ?? "");
  const [tipo, setTipo] = useState<CustomerTipo>(cliente?.tipo ?? "publico");
  const [descuento, setDescuento] = useState(
    cliente ? String(pct(cliente.descuento_pct)) : "0",
  );
  const [notas, setNotas] = useState(cliente?.notas ?? "");
  const [pending, start] = useTransition();

  function save() {
    const payload: CustomerInput = {
      nombre,
      telefono: telefono || null,
      email: email || null,
      descuento_pct: Number(descuento.replace(",", ".")) || 0,
      tipo,
      notas: notas || null,
    };
    if (!payload.nombre.trim()) return toast.error("Falta el nombre");
    if ((payload.telefono ?? "").replace(/\D/g, "").length < 10)
      return toast.error("Teléfono obligatorio (al menos 10 dígitos)");
    const d = payload.descuento_pct;
    if (!Number.isFinite(d) || d < 0 || d > 100)
      return toast.error("Descuento inválido (0–100)");

    start(async () => {
      try {
        if (esEdit) await editarCliente(cliente!.id, payload);
        else await crearCliente(payload);
        toast.success(esEdit ? "Cliente actualizado" : "Cliente registrado");
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
      title={esEdit ? "Editar cliente" : "Nuevo cliente"}
      className="max-w-md"
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Nombre</span>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre o taller"
            autoFocus
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Teléfono / WhatsApp <span className="text-red-500">*</span>
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
              Correo (opcional)
            </span>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              inputMode="email"
              placeholder="cliente@correo.com"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Tipo</span>
            <Select value={tipo} onChange={(e) => setTipo(e.target.value as CustomerTipo)}>
              {TIPOS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Descuento %
            </span>
            <Input
              value={descuento}
              onChange={(e) => setDescuento(e.target.value)}
              inputMode="decimal"
              placeholder="0"
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Notas (opcional)
          </span>
          <Input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Referencia, preferencias, historial…"
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
