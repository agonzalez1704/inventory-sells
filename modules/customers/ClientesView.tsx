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
  X,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/use-confirm";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { formatMXN } from "@/lib/money";
import { SaldoModal } from "./SaldoModal";
import { EmptyState } from "@/components/ui/empty-state";
import {
  crearCliente,
  editarCliente,
  archivarCliente,
  agregarTelefono,
  quitarTelefono,
  type Customer,
  type CustomerInput,
  type CustomerPhone,
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

export function ClientesView({
  initial,
  saldos = {},
}: {
  initial: Customer[];
  /** Store credit by customer id — only those who are owed something. */
  saldos?: Record<string, number>;
}) {
  const [verSaldo, setVerSaldo] = useState<Customer | null>(null);
  const totalSaldo = Object.values(saldos).reduce((s, n) => s + n, 0);
  const [query, setQuery] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const [editar, setEditar] = useState<Customer | null>(null);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initial;
    const tokens = q.split(/\s+/).filter(Boolean);
    return initial.filter((c) => {
      const extras = (c.customer_phones ?? []).map((p) => p.telefono).join(" ");
      const hay = `${c.nombre} ${c.telefono ?? ""} ${extras} ${c.email ?? ""}`.toLowerCase();
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

      {/* What the shop owes its customers. A liability, so it is stated once
          at the top rather than left to be added up from the badges below. */}
      {totalSaldo > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-2 p-4">
          <div>
            <p className="text-sm font-medium">Saldo a favor de clientes</p>
            <p className="text-xs text-muted-foreground">
              {Object.keys(saldos).length}{" "}
              {Object.keys(saldos).length === 1 ? "cliente" : "clientes"} · se usa
              al cobrar en el punto de venta
            </p>
          </div>
          <p className="font-mono text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatMXN(totalSaldo)}
          </p>
        </Card>
      )}

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
            <ClienteRow
              key={c.id}
              c={c}
              saldo={saldos[c.id] ?? 0}
              onEdit={() => setEditar(c)}
              onVerSaldo={() => setVerSaldo(c)}
            />
          ))}
        </div>
      )}

      {verSaldo && (
        <SaldoModal
          customerId={verSaldo.id}
          nombre={verSaldo.nombre}
          saldo={saldos[verSaldo.id] ?? 0}
          onClose={() => setVerSaldo(null)}
        />
      )}
      {nuevo && <ClienteModal onClose={() => setNuevo(false)} />}
      {editar && (
        <ClienteModal cliente={editar} onClose={() => setEditar(null)} />
      )}
    </section>
  );
}

function ClienteRow({
  c,
  saldo,
  onEdit,
  onVerSaldo,
}: {
  c: Customer;
  saldo: number;
  onEdit: () => void;
  onVerSaldo: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmar, dialogoConfirm] = useConfirm();
  const descuento = pct(c.descuento_pct);

  async function archivar() {
    if (
      !(await confirmar({
        title: `¿Archivar a ${c.nombre}?`,
        description: "Se ocultará de la lista. Su historial se conserva.",
        confirmLabel: "Archivar",
      }))
    )
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
      {dialogoConfirm}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{c.nombre}</p>
            {c.is_system ? (
              <Badge tone="neutral">Sistema</Badge>
            ) : (
              <Badge tone={TIPO_TONE[c.tipo]}>{TIPO_LABEL[c.tipo]}</Badge>
            )}
            {saldo > 0 && (
              // Clickable, because the number alone confirms nothing: the next
              // question is always "from what?".
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onVerSaldo();
                }}
                className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 transition-colors hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
              >
                <Wallet className="h-3 w-3" />
                {formatMXN(saldo)} a favor
              </button>
            )}
            {descuento > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20">
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
            {(c.customer_phones ?? []).map((p) => (
              <a
                key={p.id}
                href={`https://wa.me/${p.telefono.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <Phone className="h-3.5 w-3.5" />
                {p.telefono}
                {p.etiqueta && <span className="text-muted-foreground/70">({p.etiqueta})</span>}
              </a>
            ))}
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
        {!c.is_system && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onEdit} disabled={pending}>
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
            <button
              onClick={archivar}
              disabled={pending}
              aria-label="Archivar cliente"
              className="shrink-0 cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-red-600 dark:text-red-400"
            >
              <Archive className="h-4 w-4" />
            </button>
          </div>
        )}
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
  // Pending extra-phone input lives here so Guardar can flush it — typing a
  // number and hitting Guardar without pressing + must not silently drop it.
  const [telExtra, setTelExtra] = useState("");
  const [etiquetaExtra, setEtiquetaExtra] = useState("");

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

    // A typed-but-not-added extra phone must be valid or explicitly cleared —
    // silently dropping it is how numbers get lost.
    const extraPendiente = telExtra.trim();
    if (esEdit && extraPendiente && extraPendiente.replace(/\D/g, "").length < 10)
      return toast.error("El teléfono adicional es inválido: agrégalo con + o bórralo");

    start(async () => {
      try {
        if (esEdit) {
          await editarCliente(cliente!.id, payload);
          if (extraPendiente)
            await agregarTelefono(cliente!.id, extraPendiente, etiquetaExtra || null);
        } else {
          await crearCliente(payload);
        }
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
        {esEdit && (
          <TelefonosExtra
            cliente={cliente!}
            tel={telExtra}
            setTel={setTelExtra}
            etiqueta={etiquetaExtra}
            setEtiqueta={setEtiquetaExtra}
          />
        )}
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

// Additional phones, managed inline while editing. Saves on the spot (each
// add/remove is its own server action). The add-input state is owned by the
// parent modal so Guardar can flush a typed-but-not-added number.
function TelefonosExtra({
  cliente,
  tel,
  setTel,
  etiqueta,
  setEtiqueta,
}: {
  cliente: Customer;
  tel: string;
  setTel: (v: string) => void;
  etiqueta: string;
  setEtiqueta: (v: string) => void;
}) {
  const router = useRouter();
  const [phones, setPhones] = useState<CustomerPhone[]>(cliente.customer_phones ?? []);
  const [pending, start] = useTransition();

  function add() {
    if (tel.replace(/\D/g, "").length < 10)
      return toast.error("Teléfono inválido (al menos 10 dígitos)");
    start(async () => {
      try {
        const row = await agregarTelefono(cliente.id, tel, etiqueta || null);
        setPhones((p) => [...p, row]);
        setTel("");
        setEtiqueta("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al agregar");
      }
    });
  }

  function remove(id: string) {
    start(async () => {
      try {
        await quitarTelefono(id);
        setPhones((p) => p.filter((x) => x.id !== id));
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al quitar");
      }
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <span className="block text-xs font-medium text-muted-foreground">
        Teléfonos adicionales
      </span>
      {phones.map((p) => (
        <div key={p.id} className="flex items-center gap-2 text-sm">
          <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">
            {p.telefono}
            {p.etiqueta && (
              <span className="text-muted-foreground"> ({p.etiqueta})</span>
            )}
          </span>
          <button
            onClick={() => remove(p.id)}
            disabled={pending}
            aria-label={`Quitar ${p.telefono}`}
            className="cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-red-600 dark:hover:text-red-400"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input
          value={tel}
          onChange={(e) => setTel(e.target.value)}
          inputMode="tel"
          placeholder="55 1234 5678"
          className="flex-1"
        />
        <Input
          value={etiqueta}
          onChange={(e) => setEtiqueta(e.target.value)}
          placeholder="Etiqueta"
          className="w-28"
        />
        <Button variant="ghost" onClick={add} loading={pending}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
