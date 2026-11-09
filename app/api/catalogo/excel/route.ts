import * as XLSX from "xlsx";
import { auth, currentUser } from "@clerk/nextjs/server";
import { usuarioTieneAcceso } from "@/lib/auth/allowlist";
import { getPermisos } from "@/lib/auth/profile";
import { insforgeAdmin } from "@/lib/insforge/admin";

type Tag = { veh_marca: string | null; veh_modelo: string | null; veh_anio_desde: number | null; veh_anio_hasta: number | null };
type Fila = {
  sku: string;
  name: string;
  brand: string | null;
  familia: string | null;
  sistema: string | null;
  product_tags: { cilindrada: string | null; tags: Tag | null }[];
};

const POR_PAGINA = 1000;

// The catalog as the system reads it, one row per part: to fix it in Excel and
// upload it back from /catalogo, and as the owner's backup. "carros" is for
// reading only — the upload ignores that column.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  if (!(await usuarioTieneAcceso(await currentUser()))) return new Response("Forbidden", { status: 403 });
  const perms = await getPermisos(userId);
  if (!["admin_total", "inventario_ver", "inventario_gestionar"].some((p) => perms.has(p as never)))
    return new Response("Forbidden", { status: 403 });

  const DB = insforgeAdmin.database;
  const [fam, sis, cuenta] = await Promise.all([
    DB.from("familias").select("id, nombre, sistema"),
    DB.from("sistemas").select("id, nombre"),
    DB.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);
  const familias = new Map(((fam.data ?? []) as { id: string; nombre: string; sistema: string | null }[]).map((f) => [f.id, f]));
  const sistemas = new Map(((sis.data ?? []) as { id: string; nombre: string }[]).map((s) => [s.id, s.nombre]));

  // Oldest row first: it carries the owner's work (see catalogo_buscar).
  const pagina = async (i: number) => {
    const { data, error } = await DB.from("products")
      .select("sku, name, brand, familia, sistema, product_tags(cilindrada, tags(veh_marca, veh_modelo, veh_anio_desde, veh_anio_hasta))")
      .eq("is_active", true)
      .order("sku")
      .order("created_at")
      .order("id")
      .range(i * POR_PAGINA, i * POR_PAGINA + POR_PAGINA - 1);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Fila[];
  };
  const paginas = Math.ceil((cuenta.count ?? 0) / POR_PAGINA);
  const filas: Fila[] = [];
  try {
    for (let i = 0; i < paginas; i += 5) {
      const lote = await Promise.all(Array.from({ length: Math.min(5, paginas - i) }, (_, j) => pagina(i + j)));
      filas.push(...lote.flat());
    }
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Error", { status: 500 });
  }

  const vistos = new Set<string>();
  const renglones = filas
    .filter((f) => !vistos.has(f.sku) && vistos.add(f.sku))
    .map((f) => {
      const familia = f.familia ? familias.get(f.familia) : undefined;
      const sistema = f.sistema ?? familia?.sistema ?? null;
      const carros = f.product_tags
        .filter((p) => p.tags?.veh_marca)
        .map(({ tags: t, cilindrada }) => {
          const hasta = t!.veh_anio_hasta ?? t!.veh_anio_desde;
          const anios = hasta === t!.veh_anio_desde ? `${hasta}` : `${t!.veh_anio_desde}-${hasta}`;
          return [t!.veh_marca, t!.veh_modelo, anios, cilindrada].filter(Boolean).join(" ");
        })
        .sort();
      return [f.sku, f.name, f.brand ?? "", familia?.nombre ?? "", sistema ? (sistemas.get(sistema) ?? sistema) : "", carros.join("; ")];
    });

  const hoja = XLSX.utils.aoa_to_sheet([["sku", "nombre", "marca", "refaccion", "sistema", "carros (solo consulta)"], ...renglones]);
  hoja["!cols"] = [16, 48, 16, 22, 16, 60].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hoja, "Catalogo");
  // Compressed: Vercel caps a response at 4.5 MB and this is ~40k rows.
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true }) as Buffer;
  const archivo = `Catalogo ${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(archivo)}`,
      "Cache-Control": "no-store",
    },
  });
}
