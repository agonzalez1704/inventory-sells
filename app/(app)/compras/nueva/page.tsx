import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePagePermiso } from "@/lib/auth/profile";
import { listarProveedores } from "@/modules/proveedores/actions";
import { NuevaCompraForm } from "@/modules/compras/NuevaCompraForm";
import { insforgeAdmin } from "@/lib/insforge/admin";


export default async function NuevaCompraPage() {
  await requirePagePermiso("inventario_gestionar", "/inventario");
  const [proveedores, { data: invs }] = await Promise.all([
    listarProveedores(),
    // Where the goods land decides which row of each SKU the lines match.
    insforgeAdmin.database
      .from("inventories")
      .select("id, name")
      .eq("solo_consulta", false)
      .order("created_at", { ascending: true }),
  ]);

  return (
    <section className="space-y-5">
      <div>
        <Link
          href="/compras"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Compras
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nueva compra</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sube la factura y se llena sola. Revisa y crea la compra.
        </p>
      </div>
      <NuevaCompraForm proveedores={proveedores} inventarios={(invs ?? []) as { id: string; name: string }[]} />
    </section>
  );
}
