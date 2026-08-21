import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { auth, currentUser } from "@clerk/nextjs/server";
import { emailTieneAcceso } from "@/lib/auth/allowlist";
import { getPermisos } from "@/lib/auth/profile";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { MARCA } from "@/lib/marca";
import { CompraPdf, type CompraPdfData, type LineaCompraPdf } from "@/modules/compras/CompraPdf";

// The purchase as a document — every line at cost, terms included — so the
// same gate as the screen that shows costs: inventario_gestionar.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id } = await params;
  const { data } = await insforgeAdmin.database
    .from("compras")
    .select(
      "folio_factura, fecha_ingreso, estado, condicion, dias_credito, vence_el, " +
        "pronto_pago, pronto_pago_pct, pronto_pago_dias, notas, total_factura_cents, " +
        "proveedores(nombre), " +
        "compra_items(qty, costo_unitario_cents, line_total_cents, products(sku, name))",
    )
    .eq("id", id)
    .maybeSingle();

  const c = data as unknown as {
    folio_factura: string | null;
    fecha_ingreso: string;
    estado: string;
    condicion: string;
    dias_credito: number | null;
    vence_el: string | null;
    pronto_pago: boolean;
    pronto_pago_pct: number | null;
    pronto_pago_dias: number | null;
    notas: string | null;
    total_factura_cents: number;
    proveedores: { nombre: string } | null;
    compra_items: {
      qty: number;
      costo_unitario_cents: number;
      line_total_cents: number | null;
      products: { sku: string; name: string } | null;
    }[];
  } | null;
  if (!c) return new Response("Not found", { status: 404 });

  const lineas: LineaCompraPdf[] = (c.compra_items ?? []).map((i) => ({
    sku: i.products?.sku ?? "—",
    nombre: i.products?.name ?? "Producto eliminado",
    qty: Number(i.qty ?? 0),
    costoCents: Number(i.costo_unitario_cents ?? 0),
    totalCents: Number(i.line_total_cents ?? 0),
  }));

  const condicion =
    c.condicion === "credito"
      ? `Crédito${c.dias_credito ? ` ${c.dias_credito} días` : ""}${c.vence_el ? ` · vence ${String(c.vence_el).slice(0, 10)}` : ""}`
      : "Contado";

  const d: CompraPdfData = {
    negocio: MARCA.nombre,
    proveedor: c.proveedores?.nombre ?? "—",
    folio: c.folio_factura,
    fecha: String(c.fecha_ingreso).slice(0, 10),
    estado: c.estado === "recibida" ? "Recibida" : c.estado === "borrador" ? "Borrador" : c.estado,
    condicion,
    prontoPago:
      c.pronto_pago && c.pronto_pago_pct
        ? `${c.pronto_pago_pct}%${c.pronto_pago_dias ? ` pagando antes de ${c.pronto_pago_dias} días` : ""}`
        : null,
    notas: c.notas,
    generadoEn: new Date().toISOString(),
    lineas,
    capturadoCents: lineas.reduce((s, l) => s + l.totalCents, 0),
    totalFacturaCents: Number(c.total_factura_cents ?? 0),
  };

  // Same cast the contra-recibo uses: react-pdf types renderToBuffer against
  // DocumentProps, which a component returning <Document> doesn't satisfy.
  const buf = await renderToBuffer(
    createElement(CompraPdf, { d }) as Parameters<typeof renderToBuffer>[0],
  );
  const nombre = `Compra ${c.folio_factura ?? id.slice(0, 8)}.pdf`;

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(nombre)}"`,
      "Cache-Control": "no-store",
    },
  });
}
