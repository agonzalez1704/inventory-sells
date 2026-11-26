import { notFound } from "next/navigation";
import { getPermisos, requirePagePermiso } from "@/lib/auth/profile";
import { getConteo } from "@/modules/conteos/actions";
import { ConteoView } from "@/modules/conteos/ConteoView";

export default async function ConteoPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requirePagePermiso("inventario_ver", "/inventario");
  const { id } = await params;
  const perms = await getPermisos(userId);
  const puedeGestionar = perms.has("admin_total") || perms.has("inventario_gestionar");
  const conteo = await getConteo(id);
  if (!conteo) notFound();
  return <ConteoView conteo={conteo} puedeGestionar={puedeGestionar} />;
}
