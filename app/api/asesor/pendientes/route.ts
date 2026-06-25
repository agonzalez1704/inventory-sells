import { auth } from "@clerk/nextjs/server";
import { createInsForgeServerClient } from "@/lib/insforge/server";

export const dynamic = "force-dynamic";

// Lightweight count of conversations waiting for a human, polled by the nav
// badge so staff notice handoffs from any page.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ count: 0 });

  const insforge = await createInsForgeServerClient();
  const { data } = await insforge.database
    .from("conversaciones")
    .select("numero")
    .eq("estado", "asesor");

  return Response.json({ count: (data as unknown[] | null)?.length ?? 0 });
}
