import { createInsForgeServerClient } from "@/lib/insforge/server";
import { getPermisos, requirePagePermiso } from "@/lib/auth/profile";
import type { Inventory } from "@/lib/types";
import { InventoryView } from "@/modules/inventory/InventoryView";
import {
  conteosPorInventario,
  estadisticasInventario,
  listaInventario,
} from "@/modules/inventory/buscar";

export default async function InventarioPage() {
  const userId = await requirePagePermiso("inventario_ver");
  const perms = await getPermisos(userId);
  const admin = perms.has("admin_total");
  const puedeGestionar = admin || perms.has("inventario_gestionar");
  const verCostos = admin || perms.has("costos_ver");
  const puedePrecios = admin || perms.has("precios_gestionar");
  const verVentas = admin || perms.has("ventas_ver");

  const insforge = await createInsForgeServerClient();
  // First page, the rail's counts and the header numbers, in parallel. The
  // client re-reads with whatever filters the URL carries.
  const [primera, { data: invData }, { data: sucData }, statsIniciales, conteos] = await Promise.all([
    listaInventario({ page: 1, perPage: 50 }).catch((e: unknown) => ({
      rows: [],
      total: 0,
      error: e instanceof Error ? e.message : "No pude leer el inventario",
    })),
    insforge.database
      .from("inventories")
      .select("id, name, ciudad, entrega_dias_habiles, es_dropship, sucursal_id")
      .order("name", { ascending: true }),
    insforge.database.from("sucursales").select("id, nombre"),
    estadisticasInventario(),
    conteosPorInventario(),
  ]);

  const inventories = (invData ?? []) as Inventory[];
  const sucursales = Object.fromEntries(
    ((sucData ?? []) as { id: string; nombre: string }[]).map((s) => [s.id, s.nombre]),
  );
  // Most-stocked inventories first: the rail reads top-down by what matters.
  inventories.sort((a, b) => (conteos[b.id] ?? 0) - (conteos[a.id] ?? 0) || a.name.localeCompare(b.name));
  const error = "error" in primera ? primera.error : null;

  return (
    <>
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}
      <InventoryView
        products={primera.rows}
        totalInicial={primera.total}
        statsIniciales={statsIniciales}
        inventories={inventories}
        sucursales={sucursales}
        conteos={conteos}
        puedeGestionar={puedeGestionar}
        verCostos={verCostos}
        puedePrecios={puedePrecios}
        verVentas={verVentas}
      />
    </>
  );
}
