import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermiso, permisosDe } from "@/lib/auth/profile";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { dashboardSpecSchema, RANGOS, type Rango } from "@/modules/dashboards/spec";
import { resuelveWidget } from "@/modules/dashboards/resolver";
import { Widget } from "@/components/dashboards/WidgetsDashboard";
import { auth } from "@clerk/nextjs/server";
import { Pin, PinOff } from "lucide-react";
import { dashboardDeInicio } from "@/modules/dashboards/inicio";
import { ponerInicio } from "@/modules/dashboards/inicio-actions";

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
  const { userId } = await auth();
  const [widgets, inicio] = await Promise.all([
    Promise.all(spec.widgets.map((w) => resuelveWidget(w, rango, costosVer))),
    userId ? dashboardDeInicio(userId) : null,
  ]);
  const esInicio = inicio === fila.id;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboards" className="text-xs text-muted-foreground hover:text-foreground">← Dashboards</Link>
          <h1 className="text-xl font-semibold tracking-tight">{spec.titulo}</h1>
          {spec.descripcion && <p className="text-xs text-muted-foreground">{spec.descripcion}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* The user's home: opening the app lands here. */}
          <form action={ponerInicio.bind(null, esInicio ? null : fila.id)}>
            <button
              type="submit"
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${esInicio ? "border-brand bg-brand-soft text-brand-foreground" : "border-border hover:bg-muted"}`}
            >
              {esInicio ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              {esInicio ? "Es tu inicio · quitar" : "Poner como mi inicio"}
            </button>
          </form>
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
