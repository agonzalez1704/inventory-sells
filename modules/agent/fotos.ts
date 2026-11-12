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
      await enviarImagen(phoneNumberId, telefono, `${urlBase()}/api/wa-foto/${f.productId}`, f.caption, bsuid);
      await guardarMensaje(clave, "assistant", `[foto] ${f.caption}`);
    } catch (e) {
      console.error("Foto WhatsApp falló:", f.productId, e);
    }
  }
}
