import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { getPermisos, getAsignables } from "@/lib/auth/profile";
import { CotizacionDetalle, type CotDetalle, type CotItem } from "@/modules/cotizaciones/CotizacionDetalle";
import { planSurtido, type ProductoSurtido } from "@/lib/surtido";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  folio: string;
  customer_id: string | null;
  vendedor_id: string | null;
  created_by: string;
  estado: string;
  canal: string;
  subtotal_cents: number;
  total_cents: number;
  notas: string | null;
  created_at: string;
  expires_at: string | null;
  autorizada_at: string | null;
  sale_id: string | null;
  cancel_motivo: string | null;
  share_token: string;
};

export default async function CotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/");
  const perms = await getPermisos(userId);
  if (!perms.has("cotizar")) redirect("/");

  const { data } = await insforgeAdmin.database.from("cotizaciones").select("*").eq("id", id).maybeSingle();
  const c = data as Row | null;
  if (!c) notFound();

  const verTodas = perms.has("cotizaciones_ver_todas");
  const propia = c.created_by === userId || c.vendedor_id === userId;
  // Unassigned quotes (e.g. from the WhatsApp agent) are visible to any cotizar
  // holder so they can claim them.
  const reclamable = c.vendedor_id === null;
  if (!verTodas && !propia && !reclamable) redirect("/cotizaciones");

  // Reassign: admin/encargado (any quote) OR the current assignee passing their
  // own along to another vendedor.
  const puedeReasignar =
    perms.has("admin_total") || perms.has("cotizaciones_reasignar") || c.vendedor_id === userId;

  const [{ data: itemData }, { data: cust }, { data: profs }, asignables] = await Promise.all([
    insforgeAdmin.database
      .from("cotizacion_items")
      .select("nombre, sku, qty, unit_price_cents, cost_cents, line_total_cents")
      .eq("cotizacion_id", id),
    c.customer_id
      ? insforgeAdmin.database.from("customers").select("nombre").eq("id", c.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    insforgeAdmin.database.from("profiles").select("id, full_name"),
    puedeReasignar ? getAsignables() : Promise.resolve([]),
  ]);

  // Delivery plan (R7): what we hold vs what each supplier still owes us. Only
  // the SKUs on this quote are looked up.
  const skus = ((itemData ?? []) as CotItem[]).map((i) => i.sku).filter(Boolean) as string[];
  const { data: prodData } = skus.length
    ? await insforgeAdmin.database
        .from("products")
        .select("sku, quantity, proveedores(nombre, lead_time_dias)")
        .in("sku", skus)
    : { data: [] };
  const catalogo = new Map<string, ProductoSurtido>(
    ((prodData ?? []) as unknown as {
      sku: string;
      quantity: number;
      proveedores: { nombre: string; lead_time_dias: number } | null;
    }[]).map((p) => [
      p.sku,
      { sku: p.sku, quantity: Number(p.quantity ?? 0), proveedor: p.proveedores ?? null },
    ]),
  );
  const plan = planSurtido((itemData ?? []) as CotItem[], catalogo);

  // All profiles resolve the current assignee's name (even if their role no
  // longer grants cotizar); the reassign dropdown only lists real sellers.
  const vendName = new Map(
    ((profs ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name ?? "—"]),
  );

  const cot: CotDetalle = {
    id: c.id,
    folio: c.folio,
    estado: c.estado,
    canal: c.canal,
    cliente: c.customer_id ? (cust as { nombre: string } | null)?.nombre ?? "—" : "Mostrador",
    vendedor: c.vendedor_id ? vendName.get(c.vendedor_id) ?? "—" : null,
    vendedor_id: c.vendedor_id,
    subtotal_cents: c.subtotal_cents,
    total_cents: c.total_cents,
    notas: c.notas,
    created_at: c.created_at,
    expires_at: c.expires_at,
    autorizada_at: c.autorizada_at,
    sale_id: c.sale_id,
    cancel_motivo: c.cancel_motivo,
    share_token: c.share_token,
  };

  return (
    <CotizacionDetalle
      cot={cot}
      items={(itemData ?? []) as CotItem[]}
      plan={plan}
      perms={{
        editar: perms.has("cotizar"),
        autorizar: perms.has("autorizar"),
        convertir: perms.has("admin_total") || perms.has("cotizaciones_convertir"),
        reasignar: puedeReasignar,
        reclamar: perms.has("cotizar"),
        costos: perms.has("costos_ver"),
      }}
      vendedores={asignables}
    />
  );
}
