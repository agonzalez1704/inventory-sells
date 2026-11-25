"use client";

import { useState } from "react";
import Link from "next/link";

// "Tengo un [armadora] [modelo]": the pick reads as a sentence, and the card
// beside it says how much of the catalog fits before the visitor commits.
// The year and the version are picked in the catalog, where that model's
// counts already are.

export type ModeloCuenta = { marca: string; modelo: string; n: number };

const n = (x: number) => x.toLocaleString("es-MX");
const porNombre = (a: string, b: string) => a.localeCompare(b, "es");

const select =
  "max-w-full cursor-pointer appearance-none truncate border-0 border-b-[3px] border-[#d71f2a] bg-transparent bg-[length:10px_10px] bg-no-repeat pb-1 pr-10 font-[inherit] text-[#f2f2f3] outline-none focus-visible:border-white disabled:cursor-not-allowed disabled:border-white/15 disabled:text-[#55555b] " +
  "bg-[image:linear-gradient(45deg,transparent_50%,#d71f2a_50%),linear-gradient(135deg,#d71f2a_50%,transparent_50%)] bg-[position:calc(100%-16px)_60%,calc(100%-6px)_60%]";

export function BuscarCarro({
  modelos,
  armadoras,
  total,
}: {
  modelos: ModeloCuenta[];
  /** Pieces per make, as the catalog counts them (a part that fits two
   *  models of one make counts once). */
  armadoras: Record<string, number>;
  total: number;
}) {
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const marcas = Object.keys(armadoras).sort(porNombre);
  const deMarca = modelos.filter((m) => m.marca === marca).sort((a, b) => porNombre(a.modelo, b.modelo));
  const elegido = deMarca.find((m) => m.modelo === modelo) ?? null;

  const cuenta = elegido ? elegido.n : marca ? (armadoras[marca] ?? 0) : total;
  const etiqueta = elegido ? `${marca} ${modelo}` : marca || "Todo el catálogo";
  const href = marca
    ? `/tienda?${new URLSearchParams(modelo ? { vmarca: marca, vmodelo: modelo } : { vmarca: marca })}`
    : "/tienda";

  return (
    <div className="relative mx-auto grid max-w-[1240px] items-end gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
      <div className="flex min-w-0 flex-col gap-8 lg:gap-10">
        <span className="text-sm font-semibold text-[#ff5a63]">Busca por carro</span>
        <h2 className="m-0 text-[clamp(52px,6.4vw,84px)] font-black uppercase leading-[0.9] tracking-[-0.02em] [font-stretch:125%]">
          ¿Qué carro
          <br />
          traes?
        </h2>
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-4 text-[clamp(26px,4vw,40px)] font-bold tracking-[-0.01em]">
          <span className="text-[#8d8d93]">Tengo un</span>
          <select
            aria-label="Armadora"
            value={marca}
            onChange={(e) => {
              setMarca(e.target.value);
              setModelo("");
            }}
            className={select}
          >
            <option value="">armadora</option>
            {marcas.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <select
            aria-label="Modelo"
            value={modelo}
            disabled={!marca}
            onChange={(e) => setModelo(e.target.value)}
            className={select}
          >
            <option value="">modelo</option>
            {deMarca.map((m) => (
              <option key={m.modelo}>{m.modelo}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-5 rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-7">
        <span className="text-sm text-[#8d8d93]">{etiqueta}</span>
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <b className="text-[clamp(48px,7vw,64px)] font-black leading-none tabular-nums">{n(cuenta)}</b>
          <span className="text-lg text-[#b4b4b9]">{marca ? "piezas le quedan" : "piezas en catálogo"}</span>
        </span>
        <p className="m-0 text-base leading-relaxed text-[#8d8d93]">
          El año y la versión los eliges en el catálogo. Por cada pieza ves las otras marcas que sirven igual, con su
          precio.
        </p>
        <Link
          href={href}
          className="flex h-[60px] items-center justify-between rounded-2xl bg-[#d71f2a] px-6 text-[17px] font-bold text-white transition-[transform,background-color] duration-150 hover:bg-[#bd1a24] active:scale-[0.97]"
        >
          {marca ? "Ver sus piezas" : "Ver el catálogo"} <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}
