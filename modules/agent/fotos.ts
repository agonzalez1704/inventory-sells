import "server-only";
import { enviarImagen } from "@/lib/kapso";
import { guardarMensaje } from "./memoria";
import { urlBase } from "./pedido";

/** The photos the agent chose, after the text that announces them, in order. */
export async function mandarFotos(
  phoneNumberId: string,
  telefono: string,
  clave: string,
  fotos: { productId: string; caption: string }[],
  bsuid?: string,
) {
  for (const f of fotos) {
    try {
      // The apex answers 308 → www, and WhatsApp fetches the link itself:
      // hand it the final URL, already checked to be a JPEG.
      const r = await fetch(`${urlBase()}/api/wa-foto/${f.productId}`);
      if (!r.ok || !r.headers.get("content-type")?.startsWith("image/")) throw new Error(`wa-foto ${r.status}`);
      await enviarImagen(phoneNumberId, telefono, r.url, f.caption, bsuid);
      await guardarMensaje(clave, "assistant", `[foto] ${f.caption}`);
    } catch (e) {
      console.error("Foto WhatsApp falló:", f.productId, e);
    }
  }
}
