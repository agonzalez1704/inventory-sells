"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, Plus, Pencil, Trash2, Lock, Mail, UserPlus, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/use-confirm";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { CATALOGO_PERMISOS, type Permiso } from "@/lib/permissions";
import {
  cambiarRolUsuario,
  crearRol,
  actualizarRol,
  eliminarRol,
  invitarUsuario,
  revocarInvitacion,
} from "./actions";

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
export type InviteRow = {
  email: string;
  roleName: string;
  status: string;
  created_at: string;
};

export function UsuariosView({
  usuarios,
  roles,
  invitaciones,
}: {
  usuarios: UsuarioRow[];
  roles: RolRow[];
  invitaciones: InviteRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmar, dialogoConfirm] = useConfirm();
  const [editando, setEditando] = useState<RolRow | null>(null);
  const [creando, setCreando] = useState(false);
  const [invitando, setInvitando] = useState(false);

  async function revocar(email: string) {
    if (
      !(await confirmar({
        title: "¿Revocar la invitación?",
        description: `${email} perderá el acceso.`,
        confirmLabel: "Revocar",
        tone: "danger",
      }))
    )
      return;
    start(async () => {
      const r = await revocarInvitacion(email);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Invitación revocada");
      router.refresh();
    });
  }

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

  async function borrar(rol: RolRow) {
    if (
      !(await confirmar({
        title: `¿Eliminar el rol "${rol.name}"?`,
        confirmLabel: "Eliminar",
        tone: "danger",
      }))
    )
      return;
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
      {dialogoConfirm}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios y roles</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Asigna roles y define qué puede hacer cada uno. Crea roles nuevos con los permisos que quieras.
        </p>
      </div>

      {/* USUARIOS */}
      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Usuarios</h2>
          <Button size="sm" onClick={() => setInvitando(true)}>
            <UserPlus className="h-4 w-4" />
            Invitar
          </Button>
        </div>
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
          Invita por correo con un rol; el usuario aparece aquí al aceptar e iniciar sesión.
        </p>

        {invitaciones.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Invitaciones
            </h3>
            <Card className="divide-y divide-border">
              {invitaciones.map((i) => (
                <div key={i.email} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{i.email}</span>
                  <Badge tone="neutral">{i.roleName}</Badge>
                  <Badge tone={i.status === "accepted" ? "success" : "warning"}>
                    {i.status === "accepted" ? "Aceptada" : "Pendiente"}
                  </Badge>
                  <button
                    onClick={() => revocar(i.email)}
                    disabled={pending}
                    className="shrink-0 cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-50 dark:bg-red-950/40 hover:text-red-600 dark:text-red-400 disabled:opacity-50"
                    aria-label={`Revocar ${i.email}`}
                    title="Revocar acceso"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </Card>
          </div>
        )}
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

      {invitando && <InvitarModal roles={roles} onClose={() => setInvitando(false)} />}
    </section>
  );
}

function InvitarModal({ roles, onClose }: { roles: RolRow[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  // Default to the first non-admin role (usually Vendedor).
  const noAdmin = roles.filter((r) => !r.permisos.includes("admin_total"));
  const [roleId, setRoleId] = useState((noAdmin[0] ?? roles[0])?.id ?? "");

  function enviar() {
    start(async () => {
      const r = await invitarUsuario(email, roleId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Invitación enviada");
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal open onClose={onClose} title="Invitar usuario">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Correo</label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vendedor@correo.com"
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Rol</label>
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-muted-foreground">
          Le llega un correo para crear su cuenta; entra ya con el rol elegido.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={enviar} loading={pending} disabled={!email.trim() || !roleId}>
            <Mail className="h-4 w-4" /> Enviar invitación
          </Button>
        </div>
      </div>
    </Modal>
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

        {/*
          Sixteen permissions across four groups, each with a description, made a
          dialog taller than the screen — so the footer sat below the fold and
          you couldn't save without scrolling to find it. The list scrolls on its
          own now and the buttons stay put.

          <details> rather than state: it collapses, remembers, and is keyboard
          accessible without a line of JavaScript. Open by default — a collapsed
          group hides which permissions are ticked, which is the thing you opened
          this dialog to see. The n/m counter means a group you close yourself
          still tells you it has some.
        */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Permisos</p>
          <div className="max-h-[48vh] space-y-3 overflow-y-auto pr-1">
            {CATALOGO_PERMISOS.map((g) => {
              const activos = g.permisos.filter((p) => sel.has(p.key)).length;
              return (
                <details key={g.grupo} open className="group rounded-xl border border-border p-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center gap-1.5">
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-[[open]]:rotate-180" />
                      {g.grupo}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
                        activos > 0
                          ? "bg-accent-soft text-accent"
                          : "text-muted-foreground",
                      )}
                    >
                      {activos}/{g.permisos.length}
                    </span>
                  </summary>
                  <div className="mt-2 grid gap-2">
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
                </details>
              );
            })}
          </div>
        </div>

        {/* sticky bottom-0: the dialog's own scroll can move past this, and on a
            phone the sheet scrolls too. Pinned, Guardar is always one tap away. */}
        <div className="sticky bottom-0 -mx-5 flex justify-end gap-2 border-t border-border bg-background px-5 pb-1 pt-3">
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancelar</Button>
          <Button onClick={guardar} loading={pending} disabled={name.trim().length < 2}>
            {rol ? "Guardar" : "Crear rol"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
