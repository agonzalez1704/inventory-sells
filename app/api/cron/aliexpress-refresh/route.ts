import { NextResponse } from "next/server";
import { refrescarTokenAliExpress } from "@/lib/aliexpress";

// Daily Vercel Cron: keep the AliExpress access token alive (it dies in
// ~48h; the refresh_token lasts much longer). Runs on both deploys — a shop
// without a connection just reports "sin-conexion".
//
// When CRON_SECRET is set, Vercel sends it as a Bearer and we require it;
// without it the route stays open but all it can do is refresh our own token.
export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (secreto && req.headers.get("authorization") !== `Bearer ${secreto}`)
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });

  const r = await refrescarTokenAliExpress();
  return NextResponse.json(r, { status: r.resultado === "error" ? 502 : 200 });
}
