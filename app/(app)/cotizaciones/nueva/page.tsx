import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { getPermisos, getAsignables } from "@/lib/auth/profile";
import { CotizacionBuilder } from "@/modules/cotizaciones/CotizacionBuilder";
import type { SalesProduct } from "@/modules/sales/SalesScreen";
import type { PickerCustomer } from "@/modules/customers/CustomerPicker";

export const dynamic = "force-dynamic";

export default async function NuevaCotizacionPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const perms = await getPermisos(userId);
  const verCostos = perms.has("admin_total") || perms.has("costos_ver");
  if (!perms.has("cotizar")) redirect("/cotizaciones");
  const puedeAsignar = perms.has("cotizaciones_reasignar");

  const insforge = await createInsForgeServerClient();
  const [{ data: productData }, { data: customerData }, vendedores] = await Promise.all([
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
    puedeAsignar ? getAsignables() : Promise.resolve([]),
  ]);

  return (
    <section className="space-y-5">
      <div>
        <Link
          href="/cotizaciones"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Cotizaciones
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nueva cotización</h1>
      </div>
      <CotizacionBuilder
        verCostos={verCostos}
        products={(productData ?? []) as SalesProduct[]}
        customers={(customerData ?? []) as PickerCustomer[]}
        vendedores={vendedores}
        puedeAsignar={puedeAsignar}
      />
    </section>
  );
}
