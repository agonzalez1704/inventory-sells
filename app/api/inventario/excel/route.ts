import * as XLSX from "xlsx";
import { auth, currentUser } from "@clerk/nextjs/server";
import { usuarioTieneAcceso } from "@/lib/auth/allowlist";
import { getPermisos } from "@/lib/auth/profile";
import { insforgeAdmin } from "@/lib/insforge/admin";

type Fila = {
  sku: string;
  name: string;
  brand: string | null;
  category: string | null;
  quantity: number;
  cost_cents: number;
  price_cents: number;
};

// One inventory (?inventario=<id>, or all of them) as an Excel sheet. The
// headers are the ones the importer reads (sku, nombre, marca, categoria,
// existencia, costo, precio): edit prices in Excel, upload it back with
// "Actualizar costos y precios", done.
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  if (!(await usuarioTieneAcceso(await currentUser()))) return new Response("Forbidden", { status: 403 });
  const perms = await getPermisos(userId);
  const admin = perms.has("admin_total");
  if (!admin && !perms.has("inventario_ver")) return new Response("Forbidden", { status: 403 });
  const verCostos = admin || perms.has("costos_ver");

  const inventarioId = new URL(request.url).searchParams.get("inventario");
  const DB = insforgeAdmin.database;
  let nombre = "Todos";
  if (inventarioId) {
    const { data } = await DB.from("inventories").select("name").eq("id", inventarioId).maybeSingle();
    if (!data) return new Response("Inventario no encontrado", { status: 404 });
    nombre = (data as { name: string }).name;
  }

  // Paged: InsForge silently stops at 1,000 rows and Ruli's Mostrador has 21k.
  const filas: Fila[] = [];
  for (let desde = 0; ; desde += 1000) {
    let q = DB.from("products").select("sku, name, brand, category, quantity, cost_cents, price_cents").eq("is_active", true);
    if (inventarioId) q = q.eq("inventory_id", inventarioId);
    const { data, error } = await q.order("sku").order("id").range(desde, desde + 999);
    if (error) return new Response(error.message, { status: 500 });
    filas.push(...((data ?? []) as Fila[]));
    if ((data ?? []).length < 1000) break;
  }

  const encabezados = ["sku", "nombre", "marca", "categoria", "existencia", ...(verCostos ? ["costo"] : []), "precio"];
  const hoja = XLSX.utils.aoa_to_sheet([
    encabezados,
    ...filas.map((p) => [
      p.sku,
      p.name,
      p.brand ?? "",
      p.category ?? "",
      p.quantity,
      ...(verCostos ? [p.cost_cents / 100] : []),
      p.price_cents / 100,
    ]),
  ]);
  hoja["!cols"] = [16, 48, 16, 20, 11, ...(verCostos ? [11] : []), 11].map((wch) => ({ wch }));
  hoja["!freeze"] = { xSplit: "0", ySplit: "1", topLeftCell: "A2" };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hoja, "Inventario");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const archivo = `Inventario ${nombre} ${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(archivo)}`,
      "Cache-Control": "no-store",
    },
  });
}
