"use server";

import { auth } from "@clerk/nextjs/server";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { getPermisos } from "@/lib/auth/profile";

export type CambioVenta = { fecha: string; quien: string; cambios: string[] };

const METODO: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  otro: "Otro",
  mixto: "Mixto",
  saldo: "Saldo",
};
const pesos = (c: unknown) =>
  "$" + (Number(c ?? 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** What was changed on a sale after it was made (from caja_auditoria). */
export async function cambiosDeVenta(saleId: string): Promise<CambioVenta[]> {
  const { userId } = await auth();
  if (!userId) return [];
  const perms = await getPermisos(userId);
  if (!perms.has("admin_total") && !perms.has("ventas_ver")) {
    const { data } = await insforgeAdmin.database.from("sales").select("sold_by").eq("id", saleId).maybeSingle();
    if ((data as { sold_by: string | null } | null)?.sold_by !== userId) return [];
  }
  const { data } = await insforgeAdmin.database
    .from("caja_auditoria")
    .select("accion, antes, despues, quien, created_at")
    .eq("entidad", "venta")
    .eq("entidad_id", saleId)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as { antes: Record<string, unknown>; despues: Record<string, unknown> | null; quien: string | null; created_at: string }[];
  const ids = [...new Set(rows.map((r) => r.quien).filter(Boolean))] as string[];
  const { data: profs } = ids.length ? await insforgeAdmin.database.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const nombre = new Map(((profs ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name ?? "—"]));
  return rows
    .map((r) => {
      const a = r.antes;
      const d = r.despues ?? {};
      const cambios: string[] = [];
      if (a.payment_method !== d.payment_method)
        cambios.push(`Pago: ${METODO[String(a.payment_method)] ?? a.payment_method ?? "—"} → ${METODO[String(d.payment_method)] ?? d.payment_method ?? "—"}`);
      if (a.total_cents !== d.total_cents) cambios.push(`Total: ${pesos(a.total_cents)} → ${pesos(d.total_cents)}`);
      if (a.customer_name !== d.customer_name) cambios.push(`Cliente: ${a.customer_name ?? "—"} → ${d.customer_name ?? "—"}`);
      if (a.status !== d.status) cambios.push(d.status === "void" ? "Venta anulada" : d.status === "pending" ? "Convertida a nota de crédito" : `Estado: ${a.status} → ${d.status}`);
      return { fecha: r.created_at, quien: r.quien ? (nombre.get(r.quien) ?? "—") : "Sistema", cambios };
    })
    .filter((c) => c.cambios.length > 0);
}
