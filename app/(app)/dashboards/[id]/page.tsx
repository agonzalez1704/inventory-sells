import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermiso, permisosDe } from "@/lib/auth/profile";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { dashboardSpecSchema, RANGOS, type Rango } from "@/modules/dashboards/spec";
import { resuelveWidget } from "@/modules/dashboards/resolver";
import { Widget } from "@/components/dashboards/WidgetsDashboard";

const ETIQUETA_RANGO = { hoy: "Hoy", "7d": "7 días", "30d": "30 días", "90d": "90 días" } as const;

export default async function DashboardPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ d?: string }>;
}) {
  await requirePagePermiso("ventas_ver");
  const permisos = await permisosDe();
  const costosVer = permisos.has("costos_ver") || permisos.has("admin_total");
  const { id } = await params;
  const { d } = await searchParams;

  const { data } = await insforgeAdmin.database.from("dashboards").select("id, nombre, spec").eq("id", id).maybeSingle();
  if (!data) notFound();
  const fila = data as { id: string; nombre: string; spec: unknown };
  const parsed = dashboardSpecSchema.safeParse(fila.spec);
  if (!parsed.success) {
    return <p className="rounded-xl border border-border bg-background p-6 text-sm">Spec inválido: {parsed.error.issues[0]?.message}</p>;
  }
  const spec = parsed.data;
  const rango = (d && d in RANGOS ? d : spec.rango) as Rango;
  const widgets = await Promise.all(spec.widgets.map((w) => resuelveWidget(w, rango, costosVer)));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboards" className="text-xs text-muted-foreground hover:text-foreground">← Dashboards</Link>
          <h1 className="text-xl font-semibold tracking-tight">{spec.titulo}</h1>
          {spec.descripcion && <p className="text-xs text-muted-foreground">{spec.descripcion}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/dashboards/${fila.id}/editar`}
            className="rounded-full bg-brand px-4 py-2 text-xs font-semibold text-brand-foreground transition-transform active:scale-[0.98]">
            Editar con el Asistente
          </Link>
          <div className="flex gap-1 rounded-full border border-border p-1">
            {(Object.keys(RANGOS) as Rango[]).map((r) => (
              <Link key={r} href={`/dashboards/${fila.id}?d=${r}`}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${rango === r ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
                {ETIQUETA_RANGO[r]}
              </Link>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-6 lg:grid-cols-12">
        {widgets.map((w, i) => <Widget key={i} datos={w} />)}
      </div>
    </div>
  );
}
