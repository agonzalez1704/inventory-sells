import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { getPermisos } from "@/lib/auth/profile";
import { CotizacionBuilder } from "@/modules/cotizaciones/CotizacionBuilder";
import type { SalesProduct } from "@/modules/sales/SalesScreen";
import type { PickerCustomer } from "@/modules/customers/CustomerPicker";

export const dynamic = "force-dynamic";

export default async function NuevaCotizacionPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");
  if (!(await getPermisos(userId)).has("cotizar")) redirect("/cotizaciones");

  const insforge = await createInsForgeServerClient();
  const [{ data: productData }, { data: customerData }] = await Promise.all([
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
        products={(productData ?? []) as SalesProduct[]}
        customers={(customerData ?? []) as PickerCustomer[]}
      />
    </section>
  );
}
