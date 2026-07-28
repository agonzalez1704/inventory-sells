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
      .select("id, sku, name, brand, size, category, price_cents, quantity, image_url")
      .eq("is_active", true)
      .order("name", { ascending: true }),
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
        products={(productData ?? []) as SalesProduct[]}
        customers={(customerData ?? []) as PickerCustomer[]}
        initial={{ id, items, customerId: c.customer_id, notas: c.notas ?? "" }}
      />
    </section>
  );
}
