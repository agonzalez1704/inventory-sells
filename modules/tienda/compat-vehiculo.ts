import "server-only";
import { insforgeAdmin } from "@/lib/insforge/admin";
import type { ModeloTienda } from "@/lib/calidades";
import type { Filtros } from "./filtros";

type TagVehiculo = {
  veh_marca: string | null;
  veh_modelo: string | null;
  veh_anio_desde: number | null;
  veh_anio_hasta: number | null;
};

// "Tsuru, Sentra y 200SX"
const unir = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;

/**
 * With a vehicle chosen, what each listed part fits — from the same tags that
 * matched it: "Tsuru 1988–2002" when a model is chosen, "Tsuru, Sentra y 200SX"
 * when only the make is. Keyed by product id.
 *
 * A hint, not the list: if the lookup fails the parts still show, just without
 * the line.
 */
export async function compatibilidadDe(
  modelos: ModeloTienda[],
  f: Filtros,
): Promise<Record<string, string>> {
  if (!f.vmarca || modelos.length === 0) return {};
  const ids = modelos.flatMap((m) => m.variantes.map((v) => v.id));

  const { data, error } = await insforgeAdmin.database
    .from("product_tags")
    .select("product_id, tags(veh_marca, veh_modelo, veh_anio_desde, veh_anio_hasta)")
    .in("product_id", ids);
  if (error) return {};

  const porProducto = new Map<string, Set<string>>();
  for (const r of (data ?? []) as unknown as { product_id: string; tags: TagVehiculo | null }[]) {
    const t = r.tags;
    if (!t?.veh_marca || t.veh_marca !== f.vmarca) continue;
    if (f.vmodelo && t.veh_modelo !== f.vmodelo) continue;
    if (f.anio && t.veh_anio_desde != null && t.veh_anio_hasta != null
        && (f.anio < t.veh_anio_desde || f.anio > t.veh_anio_hasta)) continue;

    const anios =
      t.veh_anio_desde == null
        ? ""
        : t.veh_anio_desde === t.veh_anio_hasta
          ? ` ${t.veh_anio_desde}`
          : ` ${t.veh_anio_desde}–${t.veh_anio_hasta}`;
    const texto = f.vmodelo ? `${t.veh_modelo ?? t.veh_marca}${anios}` : (t.veh_modelo ?? t.veh_marca);

    const set = porProducto.get(r.product_id) ?? new Set<string>();
    set.add(texto);
    porProducto.set(r.product_id, set);
  }

  const out: Record<string, string> = {};
  for (const [id, set] of porProducto) {
    const xs = [...set];
    out[id] = xs.length <= 3 ? unir(xs) : `${xs.slice(0, 3).join(", ")} y ${xs.length - 3} más`;
  }
  return out;
}
