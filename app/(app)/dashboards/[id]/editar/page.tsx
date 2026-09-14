import { notFound } from "next/navigation";
import { requirePagePermiso, permisosDe } from "@/lib/auth/profile";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { dashboardSpecSchema, type Rango } from "@/modules/dashboards/spec";
import { resuelveWidget } from "@/modules/dashboards/resolver";
import { EditorDashboard } from "@/components/dashboards/EditorDashboard";

export default async function EditarDashboard({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermiso("ventas_ver");
  const permisos = await permisosDe();
  const costosVer = permisos.has("costos_ver") || permisos.has("admin_total");
  const { id } = await params;
  const { data } = await insforgeAdmin.database.from("dashboards").select("id, spec").eq("id", id).maybeSingle();
  if (!data) notFound();
  const fila = data as { id: string; spec: unknown };
  const parsed = dashboardSpecSchema.safeParse(fila.spec);
  if (!parsed.success) notFound();

  const widgets = await Promise.all(parsed.data.widgets.map((w) => resuelveWidget(w, parsed.data.rango as Rango, costosVer)));
  return <EditorDashboard dashboardId={fila.id} titulo={parsed.data.titulo} widgets={widgets} />;
}
