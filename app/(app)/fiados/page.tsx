import { createInsForgeServerClient } from "@/lib/insforge/server";
import { getPermisos, requirePagePermiso } from "@/lib/auth/profile";
import { comprobanteObligatorio } from "@/modules/config/negocio";
import { getTiendaInfo } from "@/modules/config/lib";
import { encabezadoTicket, terminosGarantia } from "@/lib/tienda-info";
import { LoansView, type Loan } from "@/modules/loans/LoansView";
import type { PickerCustomer } from "@/modules/customers/CustomerPicker";

export default async function FiadosPage({
  searchParams,
}: {
  searchParams: Promise<{ fiado?: string }>;
}) {
  const abrirId = (await searchParams).fiado ?? null;

  // A seller sees their own notes plus the ones the admin marked PUBLIC —
  // public means any seller may collect it when the customer walks up.
  // ventas_ver (and admin) see the whole debt book.
  const userId = await requirePagePermiso("pos_vender");
  const perms = await getPermisos(userId);
  const esAdmin = perms.has("admin_total");
  const veTodas = esAdmin || perms.has("ventas_ver");

  const comprobanteOblig = await comprobanteObligatorio();

  const insforge = await createInsForgeServerClient();

  let fiadosQuery = insforge.database
    .from("sales")
    .select(
      "id, total_cents, note, created_at, sold_by, fiado_publico, customer_id, customers(id, nombre, telefono, is_system, credito_dias), sale_items(product_id, qty, unit_price_cents, products(name, sku)), sale_pagos(id, monto_cents, metodo, created_at, created_by)",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (!veTodas)
    fiadosQuery = fiadosQuery.or(`sold_by.eq.${userId},fiado_publico.eq.true`);

  // What came in this week, for the header: abonos and settled notes alike.
  const hace7 = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [
    { data, error },
    { data: profileData },
    { data: customerData },
    { data: cobrosData },
    tienda,
  ] = await Promise.all([
    fiadosQuery,
    insforge.database.from("profiles").select("id, full_name"),
    insforge.database
      .from("customers")
      .select("id, nombre, telefono, is_system")
      .eq("is_active", true)
      .order("is_system", { ascending: false })
      .order("nombre", { ascending: true }),
    insforge.database.from("sale_pagos").select("monto_cents, created_at").gte("created_at", hace7),
    getTiendaInfo(),
  ]);

  const cobradoSemana = ((cobrosData ?? []) as { monto_cents: number }[]).reduce(
    (s, p) => s + p.monto_cents,
    0,
  );

  const sellerName = new Map(
    ((profileData ?? []) as { id: string; full_name: string | null }[]).map(
      (p) => [p.id, p.full_name],
    ),
  );

  // PostgREST returns the to-one `products`/`customers` embeds as objects; the
  // SDK's generic types them as arrays, so cast through unknown. Sum abonos.
  const loans = (
    (data ?? []) as unknown as (Loan & {
      sold_by: string | null;
      fiado_publico?: boolean;
      customers?: (PickerCustomer & { credito_dias?: number | null }) | null;
      sale_pagos?: {
        id: string;
        monto_cents: number;
        metodo: string | null;
        created_at: string;
        created_by: string | null;
      }[];
    })[]
  ).map((l) => ({
    ...l,
    pagado_cents: (l.sale_pagos ?? []).reduce((s, p) => s + p.monto_cents, 0),
    abonos: [...(l.sale_pagos ?? [])]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((p) => ({
        id: p.id,
        monto_cents: p.monto_cents,
        metodo: p.metodo,
        created_at: p.created_at,
        quien: (p.created_by ? sellerName.get(p.created_by) : null) ?? null,
      })),
    vendedor: (l.sold_by ? sellerName.get(l.sold_by) : null) ?? null,
    cliente: l.customers ?? null,
    credito_dias: l.customers?.credito_dias ?? null,
    fiado_publico: l.fiado_publico ?? false,
  })) as Loan[];

  const customers = (customerData ?? []) as PickerCustomer[];

  return (
    <>
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error.message}
        </p>
      )}
      <LoansView
        loans={loans}
        customers={customers}
        abrirId={abrirId}
        esAdmin={esAdmin}
        comprobanteObligatorio={comprobanteOblig}
        pie={{ encabezado: encabezadoTicket(tienda), garantia: terminosGarantia(tienda) }}
        cobradoSemana={cobradoSemana}
      />
    </>
  );
}
