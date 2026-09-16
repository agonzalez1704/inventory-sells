"use client";

import { cn } from "@/lib/utils";
import type { PuntoRecoger } from "@/lib/tienda-info";
import type { Entrega } from "./CartProvider";
import { etiquetaApartado } from "./apartado";

// "Centro o Panorama" — the customer picks one.
const unaDe = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} o ${xs[xs.length - 1]}`;

const nombreDe = (p: PuntoRecoger) => p.nombre ?? p.direccion;

/**
 * The delivery choice as it actually applies, whatever was stored:
 * - no pickup points → shipping is the only option;
 * - a cart that cannot be held (dropship lines) → pickup must be paid online;
 * - an unknown or unset branch → the first one.
 * Everything that reads the choice goes through here, so the cart, the
 * checkout and the order agree.
 */
export function entregaEfectiva(
  entrega: Entrega,
  puntos: PuntoRecoger[],
  puedeApartar: boolean,
): Entrega {
  if (puntos.length === 0) return { tipo: "envio", quien: "uber", sucursal: null };
  const nombres = puntos.map(nombreDe);
  return {
    tipo: entrega.tipo,
    quien: puedeApartar ? entrega.quien : "uber",
    sucursal: entrega.sucursal && nombres.includes(entrega.sucursal) ? entrega.sucursal : nombres[0],
  };
}

/**
 * "¿Cómo lo recibes?" — the approved design, shared by the cart sheet and the
 * checkout: pickup (with the branch and who collects) or shipping.
 */
export function EntregaSelector({
  entrega,
  onChange,
  puntos,
  horas,
  motivoNoApartar,
  entregaDias,
}: {
  entrega: Entrega;
  onChange: (e: Entrega) => void;
  puntos: PuntoRecoger[];
  /** Preview of the hold window; null while unknown. */
  horas: number | null;
  /** Set when this cart cannot be held (and why). */
  motivoNoApartar: string | null;
  /** The shop's shipping promise, e.g. "1 a 2 días". */
  entregaDias: string | null;
}) {
  const e = entregaEfectiva(entrega, puntos, !motivoNoApartar);
  const recoger = e.tipo === "recoger";
  const nombres = puntos.map(nombreDe);
  const set = (p: Partial<Entrega>) => onChange({ ...e, ...p });

  return (
    <div role="radiogroup" aria-label="¿Cómo lo recibes?" className="flex flex-col gap-2">
      {puntos.length > 0 && (
        <div
          className={cn(
            "rounded-xl px-3 py-2.5 transition-colors",
            recoger ? "bg-tienda-50/70 ring-2 ring-tienda-600" : "bg-background ring-1 ring-border",
          )}
        >
          <button
            type="button"
            role="radio"
            aria-checked={recoger}
            onClick={() => set({ tipo: "recoger" })}
            className="flex min-h-11 w-full cursor-pointer items-center gap-3 text-left"
          >
            <Radio on={recoger} />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-foreground">Recoger en sucursal</span>
              <span className="block truncate text-[13px] text-muted-foreground">{unaDe(nombres)}</span>
            </span>
            <span className="shrink-0 text-sm font-semibold text-green-700">Gratis</span>
          </button>

          {recoger && (
            <div className="mt-2 space-y-2.5 pb-1 pl-8">
              {puntos.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {nombres.map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={e.sucursal === n}
                      onClick={() => set({ sucursal: n })}
                      className={cn(
                        "h-11 max-w-full cursor-pointer truncate rounded-full px-4 text-sm transition-colors",
                        e.sucursal === n
                          ? "bg-tienda-600 font-medium text-white"
                          : "border border-border bg-background text-foreground hover:border-tienda-300",
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}

              {/* Who collects: own row, short label + detail on a second line
                  (the long single-line labels broke on phones). */}
              <div className="grid grid-cols-2 gap-[3px] rounded-xl bg-tienda-100/80 p-[3px] dark:bg-tienda-900/40">
                <Segmento
                  on={e.quien === "yo"}
                  disabled={!!motivoNoApartar}
                  onClick={() => set({ quien: "yo" })}
                  titulo="Voy yo"
                  detalle={
                    motivoNoApartar
                      ? "no disponible"
                      : horas != null
                        ? `aparto ${etiquetaApartado(horas).corta}`
                        : "aparto sin pagar"
                  }
                />
                <Segmento
                  on={e.quien === "uber"}
                  onClick={() => set({ quien: "uber" })}
                  titulo="Mando Uber"
                  detalle="pago ahora"
                />
              </div>
              {motivoNoApartar && (
                <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">{motivoNoApartar}</p>
              )}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        role="radio"
        aria-checked={!recoger}
        onClick={() => set({ tipo: "envio" })}
        className={cn(
          "flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
          !recoger ? "bg-tienda-50/70 ring-2 ring-tienda-600" : "bg-background ring-1 ring-border",
        )}
      >
        <Radio on={!recoger} />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-foreground">Envío a domicilio</span>
          <span className="block text-[13px] text-muted-foreground">
            {entregaDias ? `${entregaDias} · ` : ""}se cotiza con tu CP
          </span>
        </span>
      </button>
    </div>
  );
}

function Radio({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "h-5 w-5 shrink-0 rounded-full bg-white",
        on ? "border-[6px] border-tienda-600" : "border-[1.5px] border-muted-foreground/40",
      )}
    />
  );
}

function Segmento({
  on,
  disabled = false,
  onClick,
  titulo,
  detalle,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  titulo: string;
  detalle: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-[52px] min-w-0 cursor-pointer flex-col items-center justify-center rounded-[9px] px-1.5 py-1 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        on ? "bg-white shadow-sm dark:bg-background" : "hover:bg-white/50",
      )}
    >
      <span className={cn("text-sm leading-tight text-foreground", on ? "font-semibold" : "font-medium")}>
        {titulo}
      </span>
      <span className="text-[11px] leading-tight text-muted-foreground">{detalle}</span>
    </button>
  );
}
