import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { getPermisos } from "@/lib/auth/profile";
import { CotizacionesView, type CotizacionRow } from "@/modules/cotizaciones/CotizacionesView";


export default async function CotizacionesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const perms = await getPermisos(userId);
  if (!perms.has("cotizar")) redirect("/");
  const verTodas = perms.has("cotizaciones_ver_todas");

  const [{ data: cotsData }, { data: custData }, { data: profData }] = await Promise.all([
    insforgeAdmin.database
      .from("cotizaciones")
      .select("id, folio, customer_id, vendedor_id, created_by, estado, canal, total_cents, created_at, expires_at")
      .order("created_at", { ascending: false })
      .limit(200),
    insforgeAdmin.database.from("customers").select("id, nombre"),
    insforgeAdmin.database.from("profiles").select("id, full_name"),
  ]);

  const custName = new Map(((custData ?? []) as { id: string; nombre: string }[]).map((c) => [c.id, c.nombre]));
  const vendName = new Map(
    ((profData ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]),
  );

  let cots = ((cotsData ?? []) as {
    id: string;
    folio: string;
    customer_id: string | null;
    vendedor_id: string | null;
    created_by: string;
    estado: string;
    canal: string;
    total_cents: number;
    created_at: string;
    expires_at: string | null;
  }[]).map(
    (c): CotizacionRow => ({
      id: c.id,
      folio: c.folio,
      cliente: c.customer_id ? custName.get(c.customer_id) ?? "—" : "Mostrador",
      vendedor: c.vendedor_id ? vendName.get(c.vendedor_id) ?? "—" : null,
      estado: c.estado,
      canal: c.canal,
      total_cents: c.total_cents,
      created_at: c.created_at,
      expires_at: c.expires_at,
      esPropia: c.created_by === userId || c.vendedor_id === userId,
      sinAsignar: c.vendedor_id === null,
    }),
  );

  // Sellers without cotizaciones_ver_todas see their own PLUS any unassigned
  // quote (e.g. from the WhatsApp agent) so they can claim it.
  if (!verTodas) cots = cots.filter((c) => c.esPropia || c.sinAsignar);

  return <CotizacionesView cotizaciones={cots} />;
}
