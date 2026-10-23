"use server";

import { revalidatePath } from "next/cache";
import { assertPermiso } from "@/lib/auth/profile";
import { insforgeAdmin } from "@/lib/insforge/admin";

/** Make this dashboard the user's home, or clear it (null). */
export async function ponerInicio(dashboardId: string | null): Promise<void> {
  const userId = await assertPermiso("ventas_ver");
  const { error } = await insforgeAdmin.database
    .from("profiles")
    .update({ inicio_dashboard_id: dashboardId })
    .eq("id", userId);
  if (error) throw new Error(error.message ?? "No se pudo guardar");
  revalidatePath("/dashboards", "layout");
}
