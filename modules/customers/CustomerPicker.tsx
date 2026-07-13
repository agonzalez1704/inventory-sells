"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Store,
  ChevronsUpDown,
  Search,
  UserPlus,
  Check,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PhoneField } from "./PhoneField";
import { crearCliente } from "./actions";

export type PickerCustomer = {
  id: string;
  nombre: string;
  telefono: string;
  is_system: boolean;
};

// Sale customer selector: defaults to the walk-in "Mostrador", searches
// existing customers, and registers a new one inline (name + country-code
// phone) without leaving the sale.
export function CustomerPicker({
  customers,
  value,
  onChange,
}: {
  customers: PickerCustomer[];
  value: PickerCustomer;
  onChange: (c: PickerCustomer) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "new">("list");
  const [q, setQ] = useState("");
  const [list, setList] = useState<PickerCustomer[]>(customers);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => setList(customers), [customers]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return list;
    const tokens = s.split(/\s+/).filter(Boolean);
    return list.filter((c) => {
      const hay = `${c.nombre} ${c.telefono}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [q, list]);

  function pick(c: PickerCustomer) {
    onChange(c);
    setOpen(false);
    setQ("");
    setView("list");
  }

  function close() {
    setOpen(false);
    setQ("");
    setView("list");
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Elegir cliente"
        className="flex h-11 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 text-left text-sm transition-colors hover:border-ring/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
            value.is_system
              ? "bg-muted text-muted-foreground"
              : "bg-accent-soft text-accent",
          )}
        >
          <Store className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{value.nombre}</span>
        {!value.is_system && value.telefono && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {value.telefono}
          </span>
        )}
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-40 mb-2 w-full rounded-xl border border-border bg-background shadow-xl">
          {view === "list" ? (
            <>
              <div className="border-b border-border p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Buscar cliente por nombre o teléfono…"
                    className="h-9 pl-8"
                    autoFocus
                  />
                </div>
              </div>
              <ul className="max-h-56 overflow-auto py-1">
                {filtered.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => pick(c)}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/60"
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                          c.is_system
                            ? "bg-muted text-muted-foreground"
                            : "bg-accent-soft text-accent",
                        )}
                      >
                        <Store className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{c.nombre}</span>
                        {c.telefono && !c.is_system && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {c.telefono}
                          </span>
                        )}
                      </span>
                      {value.id === c.id && (
                        <Check className="h-4 w-4 shrink-0 text-accent" />
                      )}
                    </button>
                  </li>
                ))}
                {filtered.length === 0 && (
                  <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                    Sin coincidencias
                  </li>
                )}
              </ul>
              <div className="border-t border-border p-1.5">
                <button
                  type="button"
                  onClick={() => setView("new")}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent-soft"
                >
                  <UserPlus className="h-4 w-4" />
                  Nuevo cliente
                </button>
              </div>
            </>
          ) : (
            <NewCustomerForm
              onCancel={() => setView("list")}
              onClose={close}
              onCreated={(c) => {
                setList((l) => [c, ...l]);
                pick(c);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function NewCustomerForm({
  onCancel,
  onClose,
  onCreated,
}: {
  onCancel: () => void;
  onClose: () => void;
  onCreated: (c: PickerCustomer) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [pending, start] = useTransition();

  function save() {
    if (!nombre.trim()) return toast.error("Falta el nombre");
    if (telefono.replace(/\D/g, "").length < 10)
      return toast.error("Teléfono: al menos 10 dígitos");
    start(async () => {
      try {
        const { id } = await crearCliente({
          nombre,
          telefono,
          email: null,
          descuento_pct: 0,
          tipo: "publico",
          notas: null,
        });
        toast.success("Cliente registrado");
        onCreated({ id, nombre: nombre.trim(), telefono, is_system: false });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al registrar");
      }
    });
  }

  return (
    <div className="space-y-2.5 p-3">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Volver a la lista"
          className="cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium">Nuevo cliente</span>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">
          Nombre
        </span>
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre o taller"
          autoFocus
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">
          Teléfono / WhatsApp
        </span>
        <PhoneField value={telefono} onChange={setTelefono} />
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button size="sm" onClick={save} loading={pending}>
          Guardar y usar
        </Button>
      </div>
    </div>
  );
}
