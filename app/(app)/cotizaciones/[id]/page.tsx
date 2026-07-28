import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { getPermisos } from "@/lib/auth/profile";
import { CotizacionDetalle, type CotDetalle, type CotItem } from "@/modules/cotizaciones/CotizacionDetalle";

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
  if (!verTodas && !propia) redirect("/cotizaciones");

  const [{ data: itemData }, { data: cust }, { data: profs }] = await Promise.all([
    insforgeAdmin.database
      .from("cotizacion_items")
      .select("nombre, sku, qty, unit_price_cents, cost_cents, line_total_cents")
      .eq("cotizacion_id", id),
    c.customer_id
      ? insforgeAdmin.database.from("customers").select("nombre").eq("id", c.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    insforgeAdmin.database.from("profiles").select("id, full_name"),
  ]);

  const profList = ((profs ?? []) as { id: string; full_name: string | null }[]).map((p) => ({
    id: p.id,
    nombre: p.full_name ?? "—",
  }));
  const vendName = new Map(profList.map((p) => [p.id, p.nombre]));

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
  };

  return (
    <CotizacionDetalle
      cot={cot}
      items={(itemData ?? []) as CotItem[]}
      perms={{
        editar: perms.has("cotizar"),
        autorizar: perms.has("autorizar"),
        reasignar: perms.has("cotizaciones_reasignar"),
        costos: perms.has("costos_ver"),
      }}
      vendedores={profList}
    />
  );
}
