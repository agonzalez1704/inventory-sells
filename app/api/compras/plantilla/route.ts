import * as XLSX from "xlsx";
import { auth, currentUser } from "@clerk/nextjs/server";
import { emailTieneAcceso } from "@/lib/auth/allowlist";
import { getPermisos } from "@/lib/auth/profile";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { MARCA } from "@/lib/marca";
import { COLUMNAS, ENCABEZADOS, PLANTILLA_HOJA } from "@/lib/plantilla-compra";

export const runtime = "nodejs";

// The blank sheet a supplier fills in, or the shop types into. Generated from
// the same COLUMNAS the parser reads, so the file and the reader can never
// disagree about what a column means — and both businesses get an identical
// template because both build it from this one list.
//
// Optionally seeded with an inventory's products (?inventario=<id>): the point
// of a restock sheet is that you don't retype SKUs the app already knows.
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const user = await currentUser();
  if (!(await emailTieneAcceso(user?.primaryEmailAddress?.emailAddress))) {
    return new Response("Forbidden", { status: 403 });
  }
  const perms = await getPermisos(userId);
  if (!perms.has("admin_total") && !perms.has("inventario_gestionar")) {
    return new Response("Forbidden", { status: 403 });
  }

  const inventarioId = new URL(request.url).searchParams.get("inventario");

  let filas: unknown[][] = [];
  let nombreInv = "";
  if (inventarioId) {
    const [{ data: inv }, { data: prods }] = await Promise.all([
      insforgeAdmin.database
        .from("inventories")
        .select("name")
        .eq("id", inventarioId)
        .maybeSingle(),
      insforgeAdmin.database
        .from("products")
        .select("sku, name, cost_cents, quantity")
        .eq("inventory_id", inventarioId)
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ]);
    nombreInv = (inv as { name: string } | null)?.name ?? "";
    filas = ((prods ?? []) as { sku: string; name: string; cost_cents: number }[]).map((p) => [
      p.sku,
      p.name,
      "", // Cantidad — left blank on purpose: it is the one number a human must
      //     decide. Prefilling it invites receiving a quantity nobody counted.
      p.cost_cents ? p.cost_cents / 100 : "",
      "",
      "",
    ]);
  }

  const hoja = XLSX.utils.aoa_to_sheet([ENCABEZADOS, ...filas]);
  hoja["!cols"] = COLUMNAS.map((c) => ({ wch: c.ancho }));
  // Freeze the header so it stays visible while typing down a long list.
  hoja["!freeze"] = { xSplit: "0", ySplit: "1", topLeftCell: "A2" };

  // The help text lives in a second sheet rather than as rows above the header:
  // anything above the header is a row the parser has to be taught to skip, and
  // a note someone edits into a data row is a line silently dropped.
  const ayuda = XLSX.utils.aoa_to_sheet([
    [`Plantilla de compra · ${MARCA.nombre}`],
    ["Llena una fila por producto en la hoja «" + PLANTILLA_HOJA + "» y súbela en la compra."],
    [],
    ["Columna", "¿Obligatoria?", "Para qué sirve"],
    ...COLUMNAS.map((c) => [c.titulo, c.requerida ? "Sí" : "No", c.ayuda]),
    [],
    ["No cambies los títulos de las columnas: son la forma en que el sistema reconoce el archivo."],
    ["Puedes agregar columnas tuyas; se ignoran."],
  ]);
  ayuda["!cols"] = [{ wch: 22 }, { wch: 14 }, { wch: 76 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hoja, PLANTILLA_HOJA);
  XLSX.utils.book_append_sheet(wb, ayuda, "Instrucciones");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const nombre = `Plantilla compra${nombreInv ? ` · ${nombreInv}` : ""}.xlsx`;

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(nombre)}"`,
      "Cache-Control": "no-store",
    },
  });
}
