import { NextResponse, connection } from "next/server";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { enviarPlantilla, enviarTexto } from "@/lib/kapso";

// Watches the InsForge backends every five minutes and tells the owner on
// WhatsApp when one stops answering — and when it is back. Runs only where
// MONITOR_HOSTS is set (one deployment watches all), and keeps its state in
// that deployment's own database, so a dead backend elsewhere cannot silence
// the alert about itself.
//
// MONITOR_HOSTS       "w4hsbjhc.us-east.insforge.app=Ruli,y6yrt8sv.us-east.insforge.app=Fiable"
// MONITOR_WHATSAPP_TO "5214771234567" — the owner's number
// MONITOR_TEMPLATE    optional approved template name; without it a plain text
//                     is sent, which Meta only delivers inside a 24 h window.

const REAVISO_MIN = 60;

async function vivo(host: string): Promise<boolean> {
  try {
    const res = await fetch(`https://${host}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function avisar(texto: string, parametros: string[]) {
  const to = process.env.MONITOR_WHATSAPP_TO;
  const phone = process.env.KAPSO_PHONE_NUMBER_ID;
  if (!to || !phone) throw new Error("MONITOR_WHATSAPP_TO o KAPSO_PHONE_NUMBER_ID sin configurar");
  const plantilla = process.env.MONITOR_TEMPLATE;
  if (plantilla) await enviarPlantilla(phone, to, plantilla, parametros);
  else await enviarTexto(phone, to, texto);
}

const hora = (d: Date) => d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" });

export async function GET(req: Request) {
  await connection();
  const secreto = process.env.CRON_SECRET;
  if (secreto && req.headers.get("authorization") !== `Bearer ${secreto}`)
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });

  const hosts = (process.env.MONITOR_HOSTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [host, nombre] = s.split("=");
      return { host: host.trim(), nombre: (nombre ?? host).trim() };
    });
  if (!hosts.length) return NextResponse.json({ vigilados: 0 });

  const db = insforgeAdmin.database;
  const { data } = await db.from("monitor_backend").select("host, caido_desde, avisado_at").in("host", hosts.map((h) => h.host));
  const estado = new Map(((data ?? []) as { host: string; caido_desde: string | null; avisado_at: string | null }[]).map((r) => [r.host, r]));

  const resultado: Record<string, string> = {};
  for (const { host, nombre } of hosts) {
    const ok = await vivo(host);
    const prev = estado.get(host);
    const ahora = new Date();
    if (ok) {
      if (prev?.caido_desde) {
        const desde = new Date(prev.caido_desde);
        const min = Math.round((ahora.getTime() - desde.getTime()) / 60_000);
        await avisar(`✅ ${nombre}: el servidor volvió (estuvo caído ${min} min, desde las ${hora(desde)}).`, [nombre, "volvió a responder", `${min} min caído`]).catch((e) => console.error("[cron/vigilar] aviso", e));
      }
      await db.from("monitor_backend").upsert([{ host, nombre, caido_desde: null, avisado_at: prev?.caido_desde ? ahora.toISOString() : (prev?.avisado_at ?? null), updated_at: ahora.toISOString() }]);
      resultado[nombre] = "ok";
      continue;
    }
    const caidoDesde = prev?.caido_desde ? new Date(prev.caido_desde) : ahora;
    const ultimoAviso = prev?.avisado_at && prev.caido_desde ? new Date(prev.avisado_at) : null;
    const toca = !prev?.caido_desde || !ultimoAviso || ahora.getTime() - ultimoAviso.getTime() >= REAVISO_MIN * 60_000;
    if (toca) {
      const min = Math.round((ahora.getTime() - caidoDesde.getTime()) / 60_000);
      const texto = prev?.caido_desde
        ? `⚠️ ${nombre}: el servidor sigue caído (${min} min, desde las ${hora(caidoDesde)}). Reinicio: npx @insforge/cli projects update-version --wait`
        : `⚠️ ${nombre}: el servidor no responde (desde las ${hora(ahora)}). La app se ve a medias. Reinicio: npx @insforge/cli projects update-version --wait`;
      await avisar(texto, [nombre, "no responde", `desde las ${hora(caidoDesde)}`]).catch((e) => console.error("[cron/vigilar] aviso", e));
    }
    await db.from("monitor_backend").upsert([{ host, nombre, caido_desde: caidoDesde.toISOString(), avisado_at: toca ? ahora.toISOString() : (prev?.avisado_at ?? null), updated_at: ahora.toISOString() }]);
    resultado[nombre] = "caído";
  }
  return NextResponse.json({ vigilados: hosts.length, resultado });
}
