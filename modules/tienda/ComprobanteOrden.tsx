"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Receipt } from "lucide-react";
import { subirComprobanteOrden } from "./pago-actions";

/**
 * The customer's side of "manda tu comprobante": right on the order page,
 * instead of a WhatsApp round-trip a human has to relay. Paste-friendly on
 * mobile — the screenshot usually lives in their clipboard already.
 */
export function ComprobanteOrden({ ordenId }: { ordenId: string }) {
  const [referencia, setReferencia] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pegar() {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const tipo = item.types.find((t) => t.startsWith("image/"));
        if (tipo) {
          const blob = await item.getType(tipo);
          setFoto(new File([blob], `comprobante.${tipo.split("/")[1] ?? "png"}`, { type: tipo }));
          return;
        }
      }
      setErr("No hay imagen en el portapapeles — copia tu captura primero.");
    } catch {
      setErr("No se pudo leer el portapapeles; adjunta el archivo.");
    }
  }

  async function enviar() {
    if (!referencia.trim() && !foto) {
      setErr("Escribe la referencia o adjunta tu captura.");
      return;
    }
    setEnviando(true);
    setErr(null);
    let form: FormData | undefined;
    if (foto) {
      form = new FormData();
      form.append("file", foto);
    }
    const r = await subirComprobanteOrden(ordenId, referencia.trim() || null, form);
    setEnviando(false);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setListo(true);
  }

  if (listo)
    return (
      <div className="mt-3 flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        ¡Comprobante recibido! En cuanto confirmemos el depósito preparamos tu
        pedido y te avisamos.
      </div>
    );

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-tienda-200 bg-background p-3 dark:border-tienda-900">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Receipt className="h-4 w-4" /> Envíanos tu comprobante aquí
      </p>
      <input
        value={referencia}
        onChange={(e) => setReferencia(e.target.value)}
        placeholder="Referencia / clave de rastreo"
        className="h-11 w-full rounded-xl border border-tienda-200 bg-background px-3 text-base sm:text-sm outline-none focus:ring-2 focus:ring-tienda-500/30 dark:border-tienda-800"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={pegar}
          className="h-9 cursor-pointer rounded-lg border border-tienda-200 px-3 text-xs font-medium dark:border-tienda-800"
        >
          Pegar captura
        </button>
        <label className="h-9 cursor-pointer rounded-lg border border-tienda-200 px-3 text-xs font-medium leading-9 dark:border-tienda-800">
          Archivo
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
          />
        </label>
        {foto && <span className="text-xs text-muted-foreground">✓ {foto.name}</span>}
      </div>
      <button
        type="button"
        onClick={enviar}
        disabled={enviando}
        className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-tienda-600 text-sm font-semibold text-white transition-colors hover:bg-tienda-700 disabled:opacity-60"
      >
        {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
        Enviar comprobante
      </button>
      {err && <p className="text-center text-xs text-red-600 dark:text-red-400">{err}</p>}
    </div>
  );
}
