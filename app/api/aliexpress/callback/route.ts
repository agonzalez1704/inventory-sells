import { NextResponse } from "next/server";
import { llamarAuthGOP, guardarTokens } from "@/lib/aliexpress";

// AliExpress OAuth callback — the URL registered on the app ("Fiable",
// Drop Shipping category). AliExpress redirects here with ?code= after the
// owner authorizes; we exchange it for tokens and keep them in config_negocio
// so the future auto-order job can sign DS API calls.
//
// GET because that is what their authorize flow issues. No session check: the
// code is single-use, short-lived, and only AliExpress mints it — but we do
// require the app credentials to be configured, so a stray hit does nothing.
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code");
  if (!code) return NextResponse.json({ error: "falta code" }, { status: 400 });

  const { ok, status, data } = await llamarAuthGOP("/auth/token/create", { code });
  if (status === 0)
    return NextResponse.json({ error: "app no configurada" }, { status: 500 });
  if (!ok) {
    console.error("[aliexpress] token exchange falló:", status, data);
    return NextResponse.json(
      { error: data?.error_msg ?? data?.message ?? "no se pudo obtener el token" },
      { status: 502 },
    );
  }

  const errGuardar = await guardarTokens(data!);
  if (errGuardar) {
    console.error("[aliexpress] no se pudo guardar el token:", errGuardar);
    return NextResponse.json({ error: "no se pudo guardar" }, { status: 500 });
  }

  // Back to Configuración with a flag the page can toast on.
  return NextResponse.redirect(new URL("/configuracion?aliexpress=ok", req.url));
}
