import { NextResponse, connection } from "next/server";
import { insforgeAdmin } from "@/lib/insforge/admin";

// Releases holds whose clock ran out: the reserved pieces go back to the
// catalog and the order is marked 'expirada' (not 'cancelada' — nobody changed
// their mind).
//
// Belt and braces: apartar_orden_web sweeps too, so stock frees on the next
// hold even if a scheduled run is missed. This is what makes it timely for the
// customer browsing right now.
//
// When CRON_SECRET is set, Vercel sends it as a Bearer and we require it.
export async function GET(req: Request) {
  // Opt out of prerendering: with cacheComponents a route handler that reads
  // nothing from the request is built as static, and this one talks to the
  // database. `dynamic = "force-dynamic"` is rejected under cacheComponents.
  await connection();

  const secreto = process.env.CRON_SECRET;
  if (secreto && req.headers.get("authorization") !== `Bearer ${secreto}`)
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });

  const { data, error } = await insforgeAdmin.database.rpc("liberar_apartados_vencidos");
  if (error) {
    console.error("[cron/apartados]", error);
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
  return NextResponse.json({ liberados: Number(data ?? 0) });
}
