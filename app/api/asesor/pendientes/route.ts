import { auth } from "@clerk/nextjs/server";
import { createInsForgeServerClient } from "@/lib/insforge/server";

export const dynamic = "force-dynamic";

// Lightweight count of conversations waiting for a human, polled by the nav
// badge so staff notice handoffs from any page.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ count: 0 });

  const insforge = await createInsForgeServerClient();
  // head: the badge needs the number, not the rows. This is the most frequent
  // query in the app — every page polls it every 10 seconds — so shipping the
  // matching rows just to call .length on them is the wrong default to leave
  // lying around, however few of them there are today.
  const { count } = await insforge.database
    .from("conversaciones")
    .select("numero", { count: "exact", head: true })
    .eq("estado", "asesor");

  return Response.json({ count: Number(count ?? 0) });
}
