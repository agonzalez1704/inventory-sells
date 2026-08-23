import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePagePermiso } from "@/lib/auth/profile";
import { getCompra, getSaldo, listarNotas, listarPagos } from "@/modules/compras/actions";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { CompraDetalle } from "@/modules/compras/CompraDetalle";
import { CompraFinanzas } from "@/modules/compras/CompraFinanzas";


export default async function CompraPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermiso("abastecer", "/inventario");
  const { id } = await params;
  const { data: invData } = await insforgeAdmin.database
    .from("inventories")
    .select("id, name")
    .order("name");
  const inventarios = (invData ?? []) as { id: string; name: string }[];

  const compra = await getCompra(id);
  if (!compra) notFound();

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
      <CompraDetalle compra={compra} inventarios={inventarios} />
      {compra.estado !== "cancelada" && (
        <CompraFinanzas compra={compra} saldo={saldo} notas={notas} pagos={pagos} />
      )}
    </section>
  );
}
