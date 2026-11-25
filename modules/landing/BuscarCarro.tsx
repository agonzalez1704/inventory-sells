"use client";

import { useState } from "react";
import Form from "next/form";

// Armadora → modelo, then the catalog with that car applied. The year and the
// version are picked there, where the counts for that model already are.

const campo =
  "flex min-w-0 flex-1 basis-40 flex-col gap-0.5 rounded-2xl bg-[#f3f3f4] px-4 py-2.5 focus-within:ring-2 focus-within:ring-[#d71f2a]";
const select =
  "w-full cursor-pointer appearance-none border-0 bg-transparent p-0 text-base font-semibold text-[#111113] outline-none disabled:cursor-not-allowed disabled:text-[#9a9aa0]";

export function BuscarCarro({ pares }: { pares: { marca: string; modelo: string }[] }) {
  const [marca, setMarca] = useState("");
  const marcas = [...new Set(pares.map((p) => p.marca))].sort((a, b) => a.localeCompare(b, "es"));
  const modelos = pares
    .filter((p) => p.marca === marca)
    .map((p) => p.modelo)
    .sort((a, b) => a.localeCompare(b, "es"));

  return (
    <Form action="/tienda" className="flex flex-wrap gap-2">
      <label className={campo}>
        <span className="text-xs text-[#55555b]">Armadora</span>
        <select name="vmarca" required value={marca} onChange={(e) => setMarca(e.target.value)} className={select}>
          <option value="" disabled>
            Elige
          </option>
          {marcas.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
      <label className={campo}>
        <span className="text-xs text-[#55555b]">Modelo</span>
        {/* Keyed by make so switching makes resets the pick. */}
        <select key={marca} name="vmodelo" defaultValue="" disabled={!marca} className={select}>
          <option value="">{marca ? "Todos" : "Primero la armadora"}</option>
          {modelos.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="min-h-[52px] flex-1 basis-40 cursor-pointer rounded-2xl bg-[#d71f2a] px-6 text-base font-bold text-white transition-transform duration-150 hover:bg-[#bd1a24] active:scale-[0.97]"
      >
        Ver piezas
      </button>
    </Form>
  );
}
