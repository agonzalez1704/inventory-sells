import Link from "next/link";
import { requirePagePermiso } from "@/lib/auth/profile";
import { insforgeAdmin } from "@/lib/insforge/admin";

export default async function ListaDashboards() {
  await requirePagePermiso("ventas_ver");
  const { data } = await insforgeAdmin.database
    .from("dashboards").select("id, nombre, updated_at").order("updated_at", { ascending: false });
  const filas = (data ?? []) as { id: string; nombre: string; updated_at: string }[];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Dashboards</h1>
        <p className="text-xs text-muted-foreground">Se crean y editan desde el Asistente</p>
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
              <span className="font-medium">{d.nombre}</span>
              <span className="text-xs text-muted-foreground">{new Date(d.updated_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
