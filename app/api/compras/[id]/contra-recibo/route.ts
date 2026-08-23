import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { auth, currentUser } from "@clerk/nextjs/server";
import { emailTieneAcceso } from "@/lib/auth/allowlist";
import { getPermisos } from "@/lib/auth/profile";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { MARCA } from "@/lib/marca";
import {
  ContraReciboPdf,
  type ContraReciboData,
  type LineaContraRecibo,
} from "@/modules/compras/ContraReciboPdf";


// The counter-receipt for a shipment that didn't match its invoice: what was
// ordered against what actually arrived, to hand back to the supplier.
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
  if (!perms.has("admin_total") && !perms.has("abastecer")) {
    return new Response("Forbidden", { status: 403 });
  }

  const { id } = await params;
  const { data } = await insforgeAdmin.database
    .from("compras")
    .select(
      "folio_factura, fecha_ingreso, total_factura_cents, proveedores(nombre), " +
        "compra_items(qty, qty_pedida, costo_unitario_cents, line_total_cents, products(sku, name))",
    )
    .eq("id", id)
    .maybeSingle();

  const c = data as unknown as {
    folio_factura: string | null;
    fecha_ingreso: string;
    total_factura_cents: number;
    proveedores: { nombre: string } | null;
    compra_items: {
      qty: number;
      qty_pedida: number | null;
      costo_unitario_cents: number;
      line_total_cents: number | null;
      products: { sku: string; name: string } | null;
    }[];
  } | null;
  if (!c) return new Response("Not found", { status: 404 });

  const lineas: LineaContraRecibo[] = (c.compra_items ?? []).map((i) => ({
    sku: i.products?.sku ?? "—",
    nombre: i.products?.name ?? "Producto eliminado",
    pedido: i.qty_pedida,
    recibido: Number(i.qty ?? 0),
    costoCents: Number(i.costo_unitario_cents ?? 0),
  }));

  const d: ContraReciboData = {
    negocio: MARCA.nombre,
    proveedor: c.proveedores?.nombre ?? "—",
    folio: c.folio_factura,
    fecha: String(c.fecha_ingreso).slice(0, 10),
    generadoEn: new Date().toISOString(),
    lineas,
    totalFacturaCents: Number(c.total_factura_cents ?? 0),
    capturadoCents: (c.compra_items ?? []).reduce(
      (s, i) => s + Number(i.line_total_cents ?? 0),
      0,
    ),
  };

  // Same cast the inventory export uses: react-pdf types renderToBuffer against
  // DocumentProps, which a component returning <Document> doesn't structurally
  // satisfy.
  const buf = await renderToBuffer(
    createElement(ContraReciboPdf, { d }) as Parameters<typeof renderToBuffer>[0],
  );
  const nombre = `Contra recibo ${c.folio_factura ?? id.slice(0, 8)}.pdf`;

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(nombre)}"`,
      "Cache-Control": "no-store",
    },
  });
}
