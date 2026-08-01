import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePagePermiso } from "@/lib/auth/profile";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { getCompra, getSaldo, listarNotas, listarPagos } from "@/modules/compras/actions";
import { CompraDetalle } from "@/modules/compras/CompraDetalle";
import { CompraFinanzas } from "@/modules/compras/CompraFinanzas";
import type { SalesProduct } from "@/modules/sales/SalesScreen";

export const dynamic = "force-dynamic";

export default async function CompraPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermiso("inventario_gestionar", "/inventario");
  const { id } = await params;

  const compra = await getCompra(id);
  if (!compra) notFound();

  // Only a draft can gain lines, so the catalog is only needed then.
  let productos: SalesProduct[] = [];
  if (compra.estado === "borrador") {
    const insforge = await createInsForgeServerClient();
    const { data } = await insforge.database
      .from("products")
      .select("id, sku, name, brand, size, category, price_cents, quantity, image_url")
      .eq("is_active", true)
      .order("name", { ascending: true });
    productos = (data ?? []) as SalesProduct[];
  }

  // Money only matters once the goods are in: a draft has nothing to owe yet.
  const [saldo, notas, pagos] = await Promise.all([
    getSaldo(id),
    listarNotas(id),
    listarPagos(id),
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
      </div>
      <CompraDetalle compra={compra} productos={productos} />
      {compra.estado !== "cancelada" && (
        <CompraFinanzas compra={compra} saldo={saldo} notas={notas} pagos={pagos} />
      )}
    </section>
  );
}
