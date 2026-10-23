import "server-only";
import { insforgeAdmin } from "@/lib/insforge/admin";

/** Where this user's app opens: their chosen dashboard, else `porDefecto`. */
export async function rutaDeInicio(userId: string, porDefecto: string): Promise<string> {
  const id = await dashboardDeInicio(userId);
  return id ? `/dashboards/${id}` : porDefecto;
}

export async function dashboardDeInicio(userId: string): Promise<string | null> {
  const { data } = await insforgeAdmin.database
    .from("profiles")
    .select("inicio_dashboard_id")
    .eq("id", userId)
    .maybeSingle();
  return (data as { inicio_dashboard_id: string | null } | null)?.inicio_dashboard_id ?? null;
}
