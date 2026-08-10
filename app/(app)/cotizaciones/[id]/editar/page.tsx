import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { getPermisos } from "@/lib/auth/profile";
import { CotizacionBuilder } from "@/modules/cotizaciones/CotizacionBuilder";
import type { SalesProduct } from "@/modules/sales/SalesScreen";
import type { PickerCustomer } from "@/modules/customers/CustomerPicker";

export const dynamic = "force-dynamic";

export default async function EditarCotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/");
  const perms = await getPermisos(userId);
  const verCostos = perms.has("admin_total") || perms.has("costos_ver");
  if (!perms.has("cotizar")) redirect("/");

  const { data: cotData } = await insforgeAdmin.database
    .from("cotizaciones")
    .select("customer_id, vendedor_id, created_by, estado, notas")
    .eq("id", id)
    .maybeSingle();
  const c = cotData as
    | { customer_id: string | null; vendedor_id: string | null; created_by: string; estado: string; notas: string | null }
    | null;
  if (!c) notFound();

  const propia = c.created_by === userId || c.vendedor_id === userId;
  if (!perms.has("cotizaciones_ver_todas") && !propia) redirect("/cotizaciones");
  if (c.estado !== "borrador" && c.estado !== "pendiente") redirect(`/cotizaciones/${id}`);

  const insforge = await createInsForgeServerClient();
  const [{ data: productData }, { data: customerData }, { data: itemData }] = await Promise.all([
    insforge.database
      .from("products")
      // First page only; the builder searches the database from here.
      .select("id, sku, name, brand, size, category, price_cents, quantity, image_url")
      .eq("is_active", true)
      .order("quantity", { ascending: false })
      .order("name", { ascending: true })
      .limit(24),
    insforge.database
      .from("customers")
      .select("id, nombre, telefono, is_system")
      .eq("is_active", true)
      .order("is_system", { ascending: false })
      .order("nombre", { ascending: true }),
    insforgeAdmin.database.from("cotizacion_items").select("product_id, qty").eq("cotizacion_id", id),
  ]);

  const items = ((itemData ?? []) as { product_id: string | null; qty: number }[])
    .filter((i): i is { product_id: string; qty: number } => !!i.product_id)
    .map((i) => ({ product_id: i.product_id, qty: i.qty }));

  // Fetch this quote's own products by id. The catalog above is only the first
  // page now, so a line whose product falls outside it would have nothing to
  // resolve against and would disappear from the editor — and saving would then
  // drop it from the quote. Included regardless of is_active: a discontinued
  // product still has to show in a quote that already contains it.
  const idsEnCotizacion = [...new Set(items.map((i) => i.product_id))];
  const { data: itemProductData } = idsEnCotizacion.length
    ? await insforge.database
        .from("products")
        .select("id, sku, name, brand, size, category, price_cents, quantity, image_url")
        .in("id", idsEnCotizacion)
    : { data: [] };

  return (
    <section className="space-y-5">
      <div>
        <Link
          href={`/cotizaciones/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a la cotización
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Editar cotización</h1>
      </div>
      <CotizacionBuilder
        verCostos={verCostos}
        products={(productData ?? []) as SalesProduct[]}
        productosDeLaCotizacion={(itemProductData ?? []) as SalesProduct[]}
        customers={(customerData ?? []) as PickerCustomer[]}
        initial={{ id, items, customerId: c.customer_id, notas: c.notas ?? "" }}
      />
    </section>
  );
}
