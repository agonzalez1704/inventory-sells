import { NextResponse } from "next/server";
import { estadoEndpointsDS } from "@/lib/aliexpress";

// Diagnostic: is the DS API family authorized for this app yet? Calls
// aliexpress.ds.product.get with a throwaway id and reports the gateway's
// answer — the error CODE is the status ("InsufficientIsvPermissions" = not
// yet authorized; a product-level error = the endpoint itself answered).
// Returns only AliExpress's error code/message, never credentials.
export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (secreto && req.headers.get("authorization") !== `Bearer ${secreto}`)
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  return NextResponse.json(await estadoEndpointsDS());
}
