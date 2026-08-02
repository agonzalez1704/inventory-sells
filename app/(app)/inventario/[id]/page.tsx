import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getPermisos, requirePagePermiso } from "@/lib/auth/profile";
import { getCardex } from "@/modules/cardex/actions";
import { CardexView } from "@/modules/cardex/CardexView";

export const dynamic = "force-dynamic";

export default async function CardexPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requirePagePermiso("inventario_ver");
  const { id } = await params;
  const perms = await getPermisos(userId);
  // Costs are gated separately: a plain seller sees the movements, not what we paid.
  const verCostos = perms.has("admin_total") || perms.has("costos_ver");

  const { producto, movimientos, resumen } = await getCardex(id);
  if (!producto) notFound();

  return (
    <section className="space-y-5">
      <div>
        <Link
          href="/inventario"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Inventario
        </Link>
      </div>
      <CardexView
        producto={producto}
        movimientos={movimientos}
        resumen={resumen}
        verCostos={verCostos}
      />
    </section>
  );
}
