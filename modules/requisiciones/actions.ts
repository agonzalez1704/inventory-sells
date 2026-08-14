"use server";

import { auth } from "@clerk/nextjs/server";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { attempt, type ActionResult } from "@/lib/errors";
import { assertPermiso } from "@/lib/auth/profile";

/**
 * Why a line is on the list.
 *
 * 'ritmo'   — it sells, and the shelf is below the reorder point.
 * 'minimo'  — somebody set a level by hand and the shelf is under it.
 * 'agotado' — empty with no sales to go on. The one the arithmetic gets wrong.
 * 'ia'      — a judgement call the model made about an 'agotado' line.
 */
export type FuenteLinea = "ritmo" | "minimo" | "agotado" | "ia";

export type LineaRequisicion = {
  product_id: string;
  sku: string;
  nombre: string;
  inventario: string;
  proveedor_id: string | null;
  proveedor: string | null;
  existencia: number;
  ritmo_semanal: number;
  lead_dias: number;
  stock_min: number;
  stock_max: number;
  es_override: boolean;
  ya_pedido: number;
  sugerido: number;
  fuente: FuenteLinea;
  /** Null for anyone without costos_ver — the RPC never sends it. */
  costo_cents: number | null;
  motivo?: string | null;
};

export type Inventario = { id: string; name: string };

export async function listarInventarios(): Promise<Inventario[]> {
  const { userId } = await auth();
  if (!userId) return [];
  const { data } = await insforgeAdmin.database
    .from("inventories")
    .select("id, name")
    .order("name");
  return (data ?? []) as Inventario[];
}

/**
 * Say why the line is here, in the words the buyer would use.
 *
 * Written here rather than in SQL because it is presentation, and rather than
 * by the model because it is a sentence about numbers we already have — paying
 * a model to read "0" and write "agotada" would be paying for nothing.
 */
function explicar(l: LineaRequisicion): string {
  const ritmo = l.ritmo_semanal > 0 ? `vende ${l.ritmo_semanal}/sem` : "sin ventas registradas";
  const pedido = l.ya_pedido > 0 ? ` · ${l.ya_pedido} ya pedidas` : "";
  if (l.existencia <= 0) return `Agotada · ${ritmo}${pedido}`;
  // Says the level it is measured against. Without it the quantity looks
  // arbitrary — the whole complaint about the first version was not being able
  // to see why a part with stock on the shelf still needed ordering.
  const nivel = l.es_override ? `${l.stock_max} fijadas` : `${l.stock_max} deseadas`;
  return `Quedan ${l.existencia} de ${nivel} · ${ritmo}${pedido}`;
}

/**
 * The proposal, straight from the sales rate. No model involved: this is a
 * subtraction, and it has to be right every time and cost nothing to re-run
 * while the buyer moves the coverage knob.
 */
export async function generarRequisicion(
  inventarios: string[],
  coberturaSemanas: number,
): Promise<ActionResult<LineaRequisicion[]>> {
  return attempt("generarRequisicion", async () => {
    await assertPermiso("inventario_gestionar");
    const insforge = await createInsForgeServerClient();
    const { data, error } = await insforge.database.rpc("requisicion_sugerida", {
      p_inventarios: inventarios,
      p_cobertura_semanas: coberturaSemanas,
    });
    if (error) throw new Error(error.message ?? "No se pudo generar la requisición");
    return ((data ?? []) as LineaRequisicion[]).map((l) => ({
      ...l,
      existencia: Number(l.existencia),
      ritmo_semanal: Number(l.ritmo_semanal),
      sugerido: Number(l.sugerido),
      ya_pedido: Number(l.ya_pedido),
      motivo: explicar({ ...l, ritmo_semanal: Number(l.ritmo_semanal) }),
    }));
  });
}

export type RevisionIA = {
  lineas: LineaRequisicion[];
  /** Rows the model thinks are the same repair. Flagged, never merged. */
  sustitutos: { skus: string[]; motivo: string }[];
  /** Empty parts it judged not worth restocking, dropped from the list. */
  descartadas: { sku: string; nombre: string; motivo: string }[];
};

/**
 * Second pass, on demand.
 *
 * Separate from generation on purpose: the list has to appear instantly and
 * cost nothing, and if the model is down or slow the buyer still has a working
 * requisition. Paying for judgement is a choice made per run.
 */
export async function revisarConIA(
  lineas: LineaRequisicion[],
): Promise<ActionResult<RevisionIA>> {
  return attempt("revisarConIA", async () => {
    await assertPermiso("inventario_gestionar");
    const { pedirCriterio } = await import("./criterio-ia");

    const criterio = await pedirCriterio(
      lineas.map((l) => ({
        sku: l.sku,
        nombre: l.nombre,
        existencia: l.existencia,
        ritmo_semanal: l.ritmo_semanal,
        sugerido: l.sugerido,
        candidata: l.fuente === "agotado",
      })),
    );

    const { aplicarCriterio } = await import("./criterio");
    return aplicarCriterio(lineas, criterio) as RevisionIA;
  });
}

export type RequisicionGuardada = {
  id: string;
  folio: string;
  estado: "borrador" | "enviada" | "cerrada";
  cobertura_semanas: number;
  notas: string | null;
  created_at: string;
  enviada_at: string | null;
  piezas: number;
  lineas: number;
};

export async function listarRequisiciones(): Promise<RequisicionGuardada[]> {
  const { userId } = await auth();
  if (!userId) return [];
  const { data } = await insforgeAdmin.database
    .from("requisiciones")
    .select("id, folio, estado, cobertura_semanas, notas, created_at, enviada_at, requisicion_items(qty)")
    .order("created_at", { ascending: false })
    .limit(50);
  return ((data ?? []) as unknown as (Omit<RequisicionGuardada, "piezas" | "lineas"> & {
    requisicion_items: { qty: number }[];
  })[]).map(({ requisicion_items, ...r }) => ({
    ...r,
    lineas: requisicion_items.length,
    piezas: requisicion_items.reduce((s, i) => s + i.qty, 0),
  }));
}

/** Persist the edited list. What the buyer approved, not what was proposed. */
export async function guardarRequisicion(
  inventarios: string[],
  coberturaSemanas: number,
  lineas: { product_id: string; qty: number; sugerido: number; existencia: number; ritmo_semanal: number; fuente: FuenteLinea; motivo?: string | null }[],
  notas: string | null,
): Promise<ActionResult<string>> {
  return attempt("guardarRequisicion", async () => {
    await assertPermiso("inventario_gestionar");
    const insforge = await createInsForgeServerClient();
    const { data, error } = await insforge.database.rpc("crear_requisicion", {
      p_inventarios: inventarios,
      p_cobertura_semanas: coberturaSemanas,
      p_items: lineas.map((l) => ({
        product_id: l.product_id,
        qty: l.qty,
        qty_sugerida: l.sugerido,
        existencia: l.existencia,
        ritmo_semanal: l.ritmo_semanal,
        fuente: l.fuente,
        motivo: l.motivo ?? null,
      })),
      p_notas: notas,
    });
    if (error) throw new Error(error.message ?? "No se pudo guardar");
    return String(data);
  });
}

/**
 * Sending is what makes these quantities count against the next requisition,
 * so it is a state change and not a label.
 */
export async function cambiarEstado(
  id: string,
  estado: "borrador" | "enviada" | "cerrada",
): Promise<ActionResult<null>> {
  return attempt("cambiarEstadoRequisicion", async () => {
    await assertPermiso("inventario_gestionar");
    const insforge = await createInsForgeServerClient();
    const { error } = await insforge.database.rpc("cambiar_estado_requisicion", {
      p_id: id,
      p_estado: estado,
    });
    if (error) throw new Error(error.message ?? "No se pudo cambiar el estado");
    return null;
  });
}
