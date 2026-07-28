"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, Plus, Pencil, Trash2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { CATALOGO_PERMISOS, type Permiso } from "@/lib/permissions";
import { cambiarRolUsuario, crearRol, actualizarRol, eliminarRol } from "./actions";

export type RolRow = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  permisos: string[];
  userCount: number;
};
export type UsuarioRow = {
  id: string;
  full_name: string | null;
  role_id: string | null;
  roleName: string | null;
};

export function UsuariosView({
  usuarios,
  roles,
}: {
  usuarios: UsuarioRow[];
  roles: RolRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editando, setEditando] = useState<RolRow | null>(null);
  const [creando, setCreando] = useState(false);

  function reasignar(userId: string, roleId: string) {
    start(async () => {
      const r = await cambiarRolUsuario(userId, roleId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Rol actualizado");
      router.refresh();
    });
  }

  function borrar(rol: RolRow) {
    if (!confirm(`¿Eliminar el rol "${rol.name}"?`)) return;
    start(async () => {
      const r = await eliminarRol(rol.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Rol eliminado");
      router.refresh();
    });
  }

  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios y roles</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Asigna roles y define qué puede hacer cada uno. Crea roles nuevos con los permisos que quieras.
        </p>
      </div>

      {/* USUARIOS */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Usuarios</h2>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Usuario</th>
                <th className="px-4 py-2.5 font-medium">Rol</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{u.full_name || "Sin nombre"}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{u.id.slice(0, 14)}…</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={u.role_id ?? ""}
                      disabled={pending}
                      onChange={(e) => reasignar(u.id, e.target.value)}
                      className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                    >
                      {!u.role_id && <option value="">Sin rol</option>}
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="mt-2 text-xs text-muted-foreground">
          Los usuarios aparecen aquí al iniciar sesión por primera vez.
        </p>
      </div>

      {/* ROLES */}
      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Roles</h2>
          <Button size="sm" onClick={() => setCreando(true)}>
            <Plus className="h-4 w-4" />
            Nuevo rol
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {roles.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{r.name}</h3>
                    {r.is_system && (
                      <Badge tone="neutral">
                        <Lock className="mr-1 h-3 w-3" /> Sistema
                      </Badge>
                    )}
                  </div>
                  {r.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{r.description}</p>
                  )}
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5 text-accent" />
                    {r.permisos.includes("admin_total")
                      ? "Control total"
                      : `${r.permisos.length} permiso${r.permisos.length === 1 ? "" : "s"}`}
                    {" · "}
                    {r.userCount} {r.userCount === 1 ? "usuario" : "usuarios"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setEditando(r)} aria-label="Editar rol">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {!r.is_system && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => borrar(r)}
                      disabled={pending}
                      aria-label="Eliminar rol"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {(creando || editando) && (
        <RolEditor
          rol={editando}
          onClose={() => {
            setCreando(false);
            setEditando(null);
          }}
        />
      )}
    </section>
  );
}

function RolEditor({ rol, onClose }: { rol: RolRow | null; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(rol?.name ?? "");
  const [desc, setDesc] = useState(rol?.description ?? "");
  const [sel, setSel] = useState<Set<Permiso>>(new Set((rol?.permisos ?? []) as Permiso[]));

  const toggle = (p: Permiso) =>
    setSel((prev) => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });

  function guardar() {
    const permisos = [...sel];
    start(async () => {
      const r = rol
        ? await actualizarRol(rol.id, name, desc, permisos)
        : await crearRol(name, desc, permisos);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(rol ? "Rol actualizado" : "Rol creado");
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal open onClose={onClose} title={rol ? `Editar rol · ${rol.name}` : "Nuevo rol"} className="max-w-xl">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Nombre</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Cajero" autoFocus />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Descripción (opcional)</span>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
          </label>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Permisos</p>
          {CATALOGO_PERMISOS.map((g) => (
            <div key={g.grupo} className="rounded-xl border border-border p-3">
              <p className="mb-2 text-xs font-semibold">{g.grupo}</p>
              <div className="grid gap-2">
                {g.permisos.map((p) => (
                  <label key={p.key} className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={sel.has(p.key)}
                      onChange={() => toggle(p.key)}
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent"
                    />
                    <span className="min-w-0">
                      <span className={cn("block text-sm font-medium", p.key === "admin_total" && "text-accent")}>
                        {p.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">{p.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancelar</Button>
          <Button onClick={guardar} loading={pending} disabled={name.trim().length < 2}>
            {rol ? "Guardar" : "Crear rol"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
