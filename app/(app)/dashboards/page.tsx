import Link from "next/link";
import { requirePagePermiso } from "@/lib/auth/profile";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { auth } from "@clerk/nextjs/server";
import { dashboardDeInicio } from "@/modules/dashboards/inicio";

export default async function ListaDashboards() {
  await requirePagePermiso("ventas_ver");
  const { data } = await insforgeAdmin.database
    .from("dashboards").select("id, nombre, updated_at").order("updated_at", { ascending: false });
  const filas = (data ?? []) as { id: string; nombre: string; updated_at: string }[];
  const { userId } = await auth();
  const inicio = userId ? await dashboardDeInicio(userId) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Dashboards</h1>
        <p className="text-xs text-muted-foreground">Se crean desde el Asistente · abre uno y ponlo como tu inicio</p>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-background shadow-card">
        {filas.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">
            Aún no hay dashboards. Pídele uno al <Link href="/asistente" className="text-brand-strong underline">Asistente</Link>: “hazme un dashboard de ventas del mes”.
          </li>
        )}
        {filas.map((d) => (
          <li key={d.id}>
            <Link href={`/dashboards/${d.id}`} className="flex items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-muted">
              <span className="flex items-center gap-2 font-medium">
                {d.nombre}
                {d.id === inicio && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-foreground">Tu inicio</span>}
              </span>
              <span className="text-xs text-muted-foreground">{new Date(d.updated_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
