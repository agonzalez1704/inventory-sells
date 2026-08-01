import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePagePermiso } from "@/lib/auth/profile";
import { listarProveedores } from "@/modules/proveedores/actions";
import { NuevaCompraForm } from "@/modules/compras/NuevaCompraForm";

export const dynamic = "force-dynamic";

export default async function NuevaCompraPage() {
  await requirePagePermiso("inventario_gestionar", "/inventario");
  const proveedores = await listarProveedores();

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
          Captura los datos de la factura. Los productos se agregan en el siguiente paso.
        </p>
      </div>
      <NuevaCompraForm proveedores={proveedores} />
    </section>
  );
}
