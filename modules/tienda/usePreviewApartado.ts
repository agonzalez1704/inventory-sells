import { useEffect, useState } from "react";
import { previewApartado, type PreviewApartado } from "./checkout-actions";
import type { CartItem } from "./CartProvider";

const VACIO: PreviewApartado = { horas: null, motivo: null };

/**
 * How long this cart would be held, asked again whenever its pieces or
 * quantities change (debounced: a stepper tapped three times is one question).
 * Failing quietly is right here — the hold itself recomputes the window, so a
 * missing preview only costs the button its exact wording.
 */
export function usePreviewApartado(items: CartItem[], activo: boolean): PreviewApartado {
  const [estado, setEstado] = useState<PreviewApartado>(VACIO);
  const clave = items.map((i) => `${i.id}:${i.qty}`).join(",");

  useEffect(() => {
    if (!activo || !clave) return;
    let vivo = true;
    const t = setTimeout(() => {
      previewApartado(items.map((i) => ({ id: i.id, qty: i.qty })))
        .then((r) => {
          if (vivo) setEstado(r.ok ? r.data : VACIO);
        })
        .catch(() => {});
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
    // `clave` stands for items: re-asking on every render would spam the server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, activo]);

  return estado;
}
