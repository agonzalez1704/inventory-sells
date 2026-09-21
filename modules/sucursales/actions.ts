"use server";

import { auth } from "@clerk/nextjs/server";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { assertPermiso, getPermisos } from "@/lib/auth/profile";
import { attempt, type ActionResult } from "@/lib/errors";
import { mxHoy, rangoUTC } from "@/lib/caja-range";

// Branches with geo check-in. The admin defines locations and who may work
// where; the gate records where each employee actually was when they started.

export type Sucursal = {
  id: string;
  nombre: string;
  lat: number;
  lng: number;
  radio_m: number;
  is_active: boolean;
};

export async function listarSucursales(): Promise<Sucursal[]> {
  const { userId } = await auth();
  if (!userId) return [];
  const { data } = await insforgeAdmin.database
    .from("sucursales")
    .select("id, nombre, lat, lng, radio_m, is_active")
    .eq("is_active", true)
    .order("nombre");
  return (data ?? []) as Sucursal[];
}

export async function crearSucursal(input: {
  nombre: string;
  lat: number;
  lng: number;
  radioM: number;
}): Promise<ActionResult<null>> {
  return attempt("crearSucursal", async () => {
    await assertPermiso("usuarios_gestionar");
    const nombre = input.nombre.trim();
    if (!nombre) throw new Error("Falta el nombre de la sucursal");
    if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng))
      throw new Error("Falta la ubicación: usa el botón de ubicación actual");
    const radio = Math.round(input.radioM || 300);
    const { error } = await insforgeAdmin.database
      .from("sucursales")
      .insert([{ nombre, lat: input.lat, lng: input.lng, radio_m: radio }]);
    if (error) {
      if (/duplicate|unique/i.test(error.message ?? ""))
        throw new Error("Ya existe una sucursal con ese nombre");
      throw new Error(error.message ?? "No se pudo crear");
    }
    return null;
  });
}

export async function archivarSucursal(id: string): Promise<ActionResult<null>> {
  return attempt("archivarSucursal", async () => {
    await assertPermiso("usuarios_gestionar");
    const { error } = await insforgeAdmin.database
      .from("sucursales")
      .update({ is_active: false })
      .eq("id", id);
    if (error) throw new Error(error.message ?? "No se pudo archivar");
    return null;
  });
}

/** profile_id → sucursal ids, for the users screen. */
export async function asignacionesSucursales(): Promise<Record<string, string[]>> {
  const { userId } = await auth();
  if (!userId) return {};
  const { data } = await insforgeAdmin.database
    .from("profile_sucursales")
    .select("profile_id, sucursal_id");
  const map: Record<string, string[]> = {};
  for (const r of (data ?? []) as { profile_id: string; sucursal_id: string }[]) {
    (map[r.profile_id] ??= []).push(r.sucursal_id);
  }
  return map;
}

/** Replace one employee's allowed branches. Empty list = no geo gate. */
export async function setSucursalesUsuario(
  profileId: string,
  sucursalIds: string[],
): Promise<ActionResult<null>> {
  return attempt("setSucursalesUsuario", async () => {
    await assertPermiso("usuarios_gestionar");
    await insforgeAdmin.database
      .from("profile_sucursales")
      .delete()
      .eq("profile_id", profileId);
    if (sucursalIds.length) {
      const { error } = await insforgeAdmin.database
        .from("profile_sucursales")
        .insert(sucursalIds.map((s) => ({ profile_id: profileId, sucursal_id: s })));
      if (error) throw new Error(error.message ?? "No se pudo asignar");
    }
    return null;
  });
}

export type EstadoCheckin = {
  /** This user must check in before working. */
  requiere: boolean;
  /** Today's registered check-in, when there is one. */
  sucursal: string | null;
  /** Names of the branches this user may work from (for the gate's copy). */
  permitidas: string[];
};

/**
 * Where does this session stand? Admins and employees with no branch
 * assignment pass free — the gate exists only for people the admin has
 * explicitly tied to locations.
 */
export async function estadoCheckin(): Promise<EstadoCheckin> {
  const { userId } = await auth();
  if (!userId) return { requiere: false, sucursal: null, permitidas: [] };
  const perms = await getPermisos(userId);
  if (perms.has("admin_total")) return { requiere: false, sucursal: null, permitidas: [] };

  const { data: asig } = await insforgeAdmin.database
    .from("profile_sucursales")
    .select("sucursales(id, nombre, is_active)")
    .eq("profile_id", userId);
  const permitidas = ((asig ?? []) as unknown as {
    sucursales: { id: string; nombre: string; is_active: boolean } | null;
  }[])
    .map((r) => r.sucursales)
    .filter((s): s is NonNullable<typeof s> => !!s && s.is_active);
  if (permitidas.length === 0) return { requiere: false, sucursal: null, permitidas: [] };

  // One check-in per working day (Mexico's day, same clock as the corte).
  const { startISO, endISO } = rangoUTC(mxHoy(), mxHoy());
  const { data: hoy } = await insforgeAdmin.database
    .from("checkins")
    .select("sucursales(nombre)")
    .eq("profile_id", userId)
    .gte("created_at", startISO)
    .lt("created_at", endISO)
    .limit(1);
  const registrado = ((hoy ?? []) as unknown as { sucursales: { nombre: string } | null }[])[0];

  return {
    requiere: true,
    sucursal: registrado?.sucursales?.nombre ?? null,
    permitidas: permitidas.map((s) => s.nombre),
  };
}

function distanciaM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/**
 * The check-in itself: the browser's coordinates against the user's allowed
 * branches. Inside one radius → registered and through; outside all → refused
 * with the nearest branch named, so "estás a 2 km de Centro" is actionable.
 */
export async function registrarCheckin(
  lat: number,
  lng: number,
  /** GPS accuracy in meters; forgiven up to 100m on top of the radius. */
  precision?: number,
): Promise<ActionResult<{ sucursal: string }>> {
  return attempt("registrarCheckin", async () => {
    const { userId } = await auth();
    if (!userId) throw new Error("No autenticado");
    if (!Number.isFinite(lat) || !Number.isFinite(lng))
      throw new Error("Ubicación inválida");

    const { data: asig } = await insforgeAdmin.database
      .from("profile_sucursales")
      .select("sucursales(id, nombre, lat, lng, radio_m, is_active)")
      .eq("profile_id", userId);
    const permitidas = ((asig ?? []) as unknown as { sucursales: Sucursal | null }[])
      .map((r) => r.sucursales)
      .filter((s): s is Sucursal => !!s && s.is_active);
    if (permitidas.length === 0) throw new Error("No tienes sucursales asignadas");

    const tolerancia = Math.min(Math.max(precision ?? 0, 0), 100);
    const medidas = permitidas
      .map((s) => ({ s, d: distanciaM(lat, lng, s.lat, s.lng) }))
      .sort((a, b) => a.d - b.d);
    const dentro = medidas.find((m) => m.d <= m.s.radio_m + tolerancia);
    if (!dentro) {
      const cerca = medidas[0];
      const km = cerca.d >= 1500 ? `${(cerca.d / 1000).toFixed(1)} km` : `${cerca.d} m`;
      throw new Error(
        `Estás a ${km} de ${cerca.s.nombre}. Acércate a tu sucursal para empezar el día.`,
      );
    }

    const { error } = await insforgeAdmin.database.from("checkins").insert([
      {
        profile_id: userId,
        sucursal_id: dentro.s.id,
        lat,
        lng,
        distancia_m: dentro.d,
      },
    ]);
    if (error) throw new Error(error.message ?? "No se pudo registrar");
    return { sucursal: dentro.s.nombre };
  });
}

/**
 * The caller's OWN branch-block map, computed fresh — {inventory_id: sucursal}.
 * The POS polls this on focus so a tab that lived overnight (the counter
 * laptop never closes it) unblocks itself after the morning check-in without
 * anyone knowing to press F5.
 */
export async function misInventariosAjenos(): Promise<Record<string, string>> {
  const { userId } = await auth();
  if (!userId) return {};
  const { inventariosAjenos } = await import("./guard");
  return Object.fromEntries(await inventariosAjenos(userId));
}

// ---- Counter computers ----------------------------------------------------
//
// A desktop has no GPS and reads hundreds of meters off, so it is paired with
// its branch once and vouches for it. An admin mints a short code; the
// employee types it on that computer, which keeps a token from then on.

export type EquipoSucursal = { id: string; sucursal_id: string; activado_at: string | null };

async function sucursalesPermitidas(userId: string): Promise<Sucursal[]> {
  const { data } = await insforgeAdmin.database
    .from("profile_sucursales")
    .select("sucursales(id, nombre, lat, lng, radio_m, is_active)")
    .eq("profile_id", userId);
  return ((data ?? []) as unknown as { sucursales: Sucursal | null }[])
    .map((r) => r.sucursales)
    .filter((s): s is Sucursal => !!s && s.is_active);
}

const aleatorio = (bytes: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");

/** Admin: a 6-digit code, valid 15 minutes, to pair one computer with a branch. */
export async function crearCodigoEquipo(sucursalId: string): Promise<ActionResult<{ codigo: string }>> {
  return attempt("crearCodigoEquipo", async () => {
    const userId = await assertPermiso("usuarios_gestionar");
    // Six digits: typed by hand at the counter. Unique among live codes is
    // enough — a used or expired code is cleared.
    const codigo = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
    const { error } = await insforgeAdmin.database.from("sucursal_equipos").insert([
      {
        sucursal_id: sucursalId,
        codigo,
        codigo_expira: new Date(Date.now() + 15 * 60_000).toISOString(),
        created_by: userId,
      },
    ]);
    if (error) throw new Error(/unique|duplicate/i.test(error.message ?? "") ? "Intenta de nuevo" : error.message);
    return { codigo };
  });
}

/** Employee, on the counter computer: trade the code for this device's token. */
export async function activarEquipo(codigo: string): Promise<ActionResult<{ token: string; sucursal: string }>> {
  return attempt("activarEquipo", async () => {
    const { userId } = await auth();
    if (!userId) throw new Error("No autenticado");
    const limpio = codigo.replace(/\D/g, "");
    const { data } = await insforgeAdmin.database
      .from("sucursal_equipos")
      .select("id, sucursal_id, codigo_expira, sucursales(nombre)")
      .eq("codigo", limpio)
      .is("token", null)
      .maybeSingle();
    const eq = data as { id: string; sucursal_id: string; codigo_expira: string; sucursales: { nombre: string } | null } | null;
    if (!eq || new Date(eq.codigo_expira).getTime() < Date.now())
      throw new Error("Código inválido o vencido. Pide uno nuevo al administrador.");
    const permitidas = await sucursalesPermitidas(userId);
    if (!permitidas.some((s) => s.id === eq.sucursal_id))
      throw new Error(`Ese código es de ${eq.sucursales?.nombre ?? "otra sucursal"}, y no trabajas ahí.`);
    const token = aleatorio(32);
    const { error } = await insforgeAdmin.database
      .from("sucursal_equipos")
      .update({ token, codigo: null, codigo_expira: null, activado_at: new Date().toISOString(), activado_por: userId })
      .eq("id", eq.id);
    if (error) throw new Error(error.message ?? "No se pudo vincular");
    return { token, sucursal: eq.sucursales?.nombre ?? "" };
  });
}

/** Start the day from a paired computer: its branch, no location needed. */
export async function registrarCheckinEquipo(token: string): Promise<ActionResult<{ sucursal: string }>> {
  return attempt("registrarCheckinEquipo", async () => {
    const { userId } = await auth();
    if (!userId) throw new Error("No autenticado");
    const { data } = await insforgeAdmin.database
      .from("sucursal_equipos")
      .select("sucursal_id")
      .eq("token", token)
      .maybeSingle();
    const eq = data as { sucursal_id: string } | null;
    if (!eq) throw new Error("Esta computadora ya no está vinculada");
    const s = (await sucursalesPermitidas(userId)).find((x) => x.id === eq.sucursal_id);
    if (!s) throw new Error("Esta computadora es de una sucursal donde no trabajas");
    const { error } = await insforgeAdmin.database
      .from("checkins")
      .insert([{ profile_id: userId, sucursal_id: s.id, lat: s.lat, lng: s.lng, distancia_m: 0, metodo: "equipo" }]);
    if (error) throw new Error(error.message ?? "No se pudo registrar");
    return { sucursal: s.nombre };
  });
}

/** Admin: paired computers, to see and revoke them. */
export async function listarEquipos(): Promise<EquipoSucursal[]> {
  const { userId } = await auth();
  if (!userId) return [];
  const perms = await getPermisos(userId);
  if (!perms.has("admin_total") && !perms.has("usuarios_gestionar")) return [];
  const { data } = await insforgeAdmin.database
    .from("sucursal_equipos")
    .select("id, sucursal_id, activado_at")
    .not("token", "is", null)
    .order("activado_at", { ascending: false });
  return (data ?? []) as EquipoSucursal[];
}

export async function quitarEquipo(id: string): Promise<ActionResult<null>> {
  return attempt("quitarEquipo", async () => {
    await assertPermiso("usuarios_gestionar");
    const { error } = await insforgeAdmin.database.from("sucursal_equipos").delete().eq("id", id);
    if (error) throw new Error(error.message ?? "No se pudo quitar");
    return null;
  });
}
