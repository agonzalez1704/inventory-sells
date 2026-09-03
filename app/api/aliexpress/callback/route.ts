import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { insforgeAdmin } from "@/lib/insforge/admin";

// AliExpress "rest" endpoints use the GOP signature: concatenate the API path
// with every param as key+value in ascii key order, HMAC-SHA256 it with the
// app secret, uppercase hex. The secret itself never travels.
function firmar(path: string, params: Record<string, string>, secret: string): string {
  const base =
    path +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  return createHmac("sha256", secret).update(base).digest("hex").toUpperCase();
}

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
  const appKey = process.env.ALIEXPRESS_APP_KEY;
  const appSecret = process.env.ALIEXPRESS_APP_SECRET;
  if (!code) return NextResponse.json({ error: "falta code" }, { status: 400 });
  if (!appKey || !appSecret)
    return NextResponse.json({ error: "app no configurada" }, { status: 500 });

  const params: Record<string, string> = {
    app_key: appKey,
    code,
    sign_method: "sha256",
    timestamp: String(Date.now()),
  };
  params.sign = firmar("/auth/token/create", params, appSecret);

  const res = await fetch("https://api-sg.aliexpress.com/rest/auth/token/create", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = (await res.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number | string;
    error_msg?: string;
    message?: string;
    code?: string;
  } | null;

  if (!res.ok || !data?.access_token) {
    console.error("[aliexpress] token exchange falló:", res.status, data);
    return NextResponse.json(
      { error: data?.error_msg ?? data?.message ?? "no se pudo obtener el token" },
      { status: 502 },
    );
  }

  const expira = new Date(
    Date.now() + Number(data.expires_in ?? 0) * 1000,
  ).toISOString();
  const { error } = await insforgeAdmin.database
    .from("config_negocio")
    .update({
      aliexpress_token: data.access_token,
      aliexpress_refresh: data.refresh_token ?? null,
      aliexpress_expira: expira,
    })
    .eq("id", 1);
  if (error) {
    console.error("[aliexpress] no se pudo guardar el token:", error);
    return NextResponse.json({ error: "no se pudo guardar" }, { status: 500 });
  }

  // Back to Configuración with a flag the page can toast on.
  return NextResponse.redirect(new URL("/configuracion?aliexpress=ok", req.url));
}
