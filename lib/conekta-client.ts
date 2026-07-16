"use client";

// Card tokenization runs in the BROWSER against Conekta with the public key, so
// raw card numbers never touch our server or our database — only the resulting
// token id does. Loading Conekta.js on demand keeps it off every catalog page.

type ConektaGlobal = {
  setPublicKey: (k: string) => void;
  Token: {
    create: (
      params: { card: { number: string; name: string; exp_year: string; exp_month: string; cvc: string } },
      success: (t: { id: string }) => void,
      error: (e: { message_to_purchaser?: string; message?: string }) => void,
    ) => void;
  };
};

declare global {
  interface Window {
    Conekta?: ConektaGlobal;
  }
}

const SRC = "https://cdn.conekta.io/js/latest/conekta.js";
let loading: Promise<void> | null = null;

function cargar(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("solo cliente"));
  if (window.Conekta) return Promise.resolve();
  if (loading) return loading;

  loading = new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = SRC;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      loading = null; // let a retry re-attempt the load
      reject(new Error("No se pudo cargar el procesador de pagos"));
    };
    document.head.appendChild(el);
  });
  return loading;
}

export type DatosTarjeta = {
  numero: string;
  nombre: string;
  mes: string;
  anio: string;
  cvc: string;
};

export async function tokenizarTarjeta(c: DatosTarjeta): Promise<string> {
  const key = process.env.NEXT_PUBLIC_CONEKTA_PUBLIC_KEY;
  if (!key) throw new Error("Pagos con tarjeta no configurados");

  await cargar();
  const Conekta = window.Conekta;
  if (!Conekta) throw new Error("No se pudo cargar el procesador de pagos");
  Conekta.setPublicKey(key);

  return new Promise<string>((resolve, reject) => {
    Conekta.Token.create(
      {
        card: {
          number: c.numero.replace(/\s/g, ""),
          name: c.nombre.trim(),
          exp_month: c.mes.trim(),
          exp_year: c.anio.trim(),
          cvc: c.cvc.trim(),
        },
      },
      (t) => resolve(t.id),
      (e) =>
        // Conekta's purchaser-facing copy is already in Spanish and safe to show.
        reject(new Error(e.message_to_purchaser || e.message || "Tarjeta rechazada")),
    );
  });
}
