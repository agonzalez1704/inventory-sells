import { Suspense } from "react";
import { requirePagePermiso } from "@/lib/auth/profile";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { listaInventario, type FiltrosInventario, type OrdenLista } from "@/modules/inventory/buscar";
import { EtiquetasQR, type ItemEtiqueta } from "@/modules/inventory/EtiquetasQR";

// Outside the (app) group on purpose: no sidebar or banners to hide when printing.

const MAX = 600;
const ORDENES: OrdenLista[] = ["vendidos", "stock_asc", "stock_desc", "precio_asc", "precio_desc"];
type SP = Record<string, string | string[] | undefined>;

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || null;
const numero = (v: string | null) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);

async function Etiquetas({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePagePermiso("inventario_ver", "/inventario");
  const sp = await searchParams;
  const ids = (uno(sp.ids) ?? "").split(",").filter(Boolean).slice(0, MAX);

  let items: ItemEtiqueta[] = [];
  let total = 0;
  if (ids.length > 0) {
    const insforge = await createInsForgeServerClient();
    const { data } = await insforge.database.rpc("inventario_lista", {
      p_f: {},
      p_ids: ids,
      p_limit: 1000,
      p_offset: 0,
    });
    items = (data ?? []) as ItemEtiqueta[];
    total = items.length;
  } else {
    // Same filters as the list the user was looking at.
    const orden = uno(sp.orden) as OrdenLista | null;
    const alerta = uno(sp.alerta);
    const inv = uno(sp.inv);
    const filtros: FiltrosInventario = {
      inv: inv && inv !== "all" ? inv : null,
      alerta: alerta === "bajo" || alerta === "agotado" ? alerta : null,
      cat: uno(sp.cat),
      pmin: numero(uno(sp.pmin)),
      pmax: numero(uno(sp.pmax)),
      orden: orden && ORDENES.includes(orden) ? orden : null,
    };
    for (let page = 1; items.length < MAX; page++) {
      const r = await listaInventario({ query: uno(sp.q) ?? "", filtros, page, perPage: 200 });
      total = r.total;
      items.push(...r.rows);
      if (r.rows.length < 200) break;
    }
    items = items.slice(0, MAX);
  }

  return (
    <EtiquetasQR
      items={items.map(({ id, sku, name, price_cents }) => ({ id, sku, name, price_cents }))}
      recortado={Math.max(0, total - items.length)}
    />
  );
}

export default function EtiquetasPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-muted-foreground">Preparando etiquetas…</p>}>
      <Etiquetas searchParams={searchParams} />
    </Suspense>
  );
}
