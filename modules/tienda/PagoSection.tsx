"use client";

import { useState } from "react";
import Cards, { type Focused } from "react-credit-cards-2";
import "react-credit-cards-2/dist/es/styles-compiled.css";
import { CreditCard, Store, ArrowLeftRight, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { VOUCHER_HORAS_UI } from "./pago-const";
import type { ConektaMethod } from "./pago-const";
import type { DatosTarjeta } from "@/lib/conekta-client";

// Brand logos live in /public/pay. A method either shows its provider logo
// (which already carries the name) or, for a generic card, a lucide icon + a
// "Tarjeta" label — there's no single card-brand logo to stand in for it.
const METODOS: {
  value: ConektaMethod;
  label: string;
  desc: string;
  icon: typeof CreditCard;
  logo?: string;
}[] = [
  { value: "card", label: "Tarjeta", desc: "Débito o crédito", icon: CreditCard },
  { value: "oxxo", label: "OXXO", desc: `Ficha válida ${VOUCHER_HORAS_UI} h`, icon: Store, logo: "/pay/oxxo.svg" },
  { value: "spei", label: "Transferencia", desc: "SPEI · CLABE", icon: ArrowLeftRight, logo: "/pay/spei.svg" },
  { value: "aplazo", label: "A pagos", desc: "Paga después", icon: CalendarClock, logo: "/pay/aplazo.png" },
];

export function PagoSection({
  metodo,
  setMetodo,
  tarjeta,
  setTarjeta,
}: {
  metodo: ConektaMethod;
  setMetodo: (m: ConektaMethod) => void;
  tarjeta: DatosTarjeta;
  setTarjeta: (t: DatosTarjeta) => void;
}) {
  const set = (k: keyof DatosTarjeta) => (v: string) => setTarjeta({ ...tarjeta, [k]: v });
  // Drives the card preview's flip + highlighted field.
  const [foco, setFoco] = useState<Focused | undefined>(undefined);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Método de pago</h2>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {METODOS.map((m) => {
          const activo = metodo === m.value;
          return (
            <button
              key={m.value}
              onClick={() => setMetodo(m.value)}
              className={cn(
                // min-h + justify-center so every tile is the same height and
                // its content centers, whether it has a logo, an icon+label, or
                // one line of copy vs two — otherwise the card tile (which keeps
                // a label) made its whole grid row taller than the rest.
                "flex min-h-[5.5rem] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border p-3 text-center transition-colors",
                activo
                  ? "border-blue-500 bg-blue-50/60 text-blue-800"
                  : "border-slate-200 text-slate-600 hover:border-blue-200",
              )}
            >
              {/* Fixed-height brand row so logos of different aspect ratios and
                  the card icon all sit on the same baseline across the grid. */}
              <span className="flex h-6 items-center justify-center">
                {m.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- static brand asset, no layout shift
                  <img
                    src={m.logo}
                    alt={m.label}
                    className="max-h-5 w-auto max-w-full object-contain"
                  />
                ) : (
                  <m.icon className="h-5 w-5" />
                )}
              </span>
              {/* The logo already names the method; only the card needs a label. */}
              {!m.logo && <span className="text-xs font-semibold">{m.label}</span>}
              <span className="text-[10px] leading-tight text-slate-500">{m.desc}</span>
            </button>
          );
        })}
      </div>

      {metodo === "card" && (
        <div className="mt-4">
          {/* Preview beside the fields so the card reacts in place as they type —
              brand detection and the CVC flip land in peripheral vision instead
              of scrolled off above. The card is a fixed 290px (library CSS), so
              it never flexes: it holds its size and the fields take the rest.
              Stacks below sm, where 290px + inputs can't share a row. */}
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="shrink-0 self-center sm:self-start">
              <Cards
                number={tarjeta.numero}
                name={tarjeta.nombre}
                expiry={`${tarjeta.mes}${tarjeta.anio.slice(-2)}`}
                cvc={tarjeta.cvc}
                focused={foco}
                placeholders={{ name: "TU NOMBRE" }}
                locale={{ valid: "vence" }}
              />
            </div>

            {/* min-w-0: without it the flex item refuses to shrink below its
                content and pushes the card out of the row at lg. */}
            <div className="min-w-0 flex-1 space-y-3">
              <Campo
                label="Número de tarjeta"
                value={tarjeta.numero}
                onChange={(v) => set("numero")(v.replace(/[^\d\s]/g, "").slice(0, 19))}
                onFocus={() => setFoco("number")}
                inputMode="numeric"
                placeholder="4242 4242 4242 4242"
              />
              <Campo
                label="Nombre en la tarjeta"
                value={tarjeta.nombre}
                onChange={set("nombre")}
                onFocus={() => setFoco("name")}
              />
              <div className="grid grid-cols-3 gap-2">
                <Campo label="Mes" value={tarjeta.mes} onChange={(v) => set("mes")(v.replace(/\D/g, "").slice(0, 2))} onFocus={() => setFoco("expiry")} inputMode="numeric" placeholder="12" />
                <Campo label="Año" value={tarjeta.anio} onChange={(v) => set("anio")(v.replace(/\D/g, "").slice(0, 4))} onFocus={() => setFoco("expiry")} inputMode="numeric" placeholder="2030" />
                <Campo label="CVC" value={tarjeta.cvc} onChange={(v) => set("cvc")(v.replace(/\D/g, "").slice(0, 4))} onFocus={() => setFoco("cvc")} inputMode="numeric" placeholder="123" />
              </div>
            </div>
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
            Tus datos de tarjeta viajan cifrados directo a Conekta — no pasan por
            nuestros servidores.
          </p>
        </div>
      )}

      {metodo === "oxxo" && (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Te damos una ficha con referencia para pagar en cualquier OXXO. Tu
          pedido se aparta y la ficha vence en {VOUCHER_HORAS_UI} horas.
        </p>
      )}
      {metodo === "spei" && (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Te damos una CLABE para transferir desde tu banco. Tu pedido se aparta
          y la referencia vence en {VOUCHER_HORAS_UI} horas.
        </p>
      )}
      {metodo === "aplazo" && (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Te llevamos a Aplazo para aprobar tus pagos y regresas aquí.
        </p>
      )}
    </section>
  );
}

function Campo({
  label,
  value,
  onChange,
  onFocus,
  inputMode,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
  inputMode?: "text" | "numeric";
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        inputMode={inputMode}
        placeholder={placeholder}
        autoComplete="off"
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none placeholder:text-slate-300 focus:ring-2 focus:ring-blue-400"
      />
    </label>
  );
}
