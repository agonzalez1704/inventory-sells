"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { unwrap } from "@/lib/errors";
import { formatMXN } from "@/lib/money";
import { altaDesdeLista, aplicarSae, compararSae, guardarFactor, type CambioSae, type FilaSae } from "./actions";
import { Input } from "@/components/ui/input";

type Resultado = {
  precios: CambioSae[];
  costos: CambioSae[];
  minimos: { sku: string; antes: number | null; despues: number }[];
  nuevas: string[];
};

type FilaLista = { sku: string; pl: number; nombre: string };

const norm = (v: unknown) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

/**
 * Grob's monthly list (Lista Plana, Comfort-S): a title block, then
 * `Linea | Codigo Catalogo | UPC | DESCRIPCION | P.L. | …`. Only the FIRST
 * sheet that has it counts — the Lista Plana's other tabs (Suspension,
 * Soportes…) are the same list cut up, and Comfort's first tab is a cover.
 */
function leerListaGrob(XLSX: typeof import("xlsx"), wb: import("xlsx").WorkBook): FilaLista[] | null {
  for (const nombre of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nombre], { header: 1, defval: "", raw: false });
    for (let h = 0; h < Math.min(rows.length, 15); h++) {
      const enc = (rows[h] ?? []).map(norm);
      const iCod = enc.indexOf("codigo catalogo");
      const iPl = enc.indexOf("p.l.");
      if (iCod < 0 || iPl < 0) continue;
      const iDesc = enc.indexOf("descripcion");
      const vistos = new Set<string>();
      const out: FilaLista[] = [];
      for (const r of rows.slice(h + 1)) {
        const sku = String(r[iCod] ?? "").trim();
        const pl = centavos(r[iPl]) / 100;
        if (!sku || !pl || vistos.has(sku)) continue;
        vistos.add(sku);
        out.push({ sku, pl, nombre: iDesc >= 0 ? String(r[iDesc] ?? "").replace(/\s+/g, " ").trim() : "" });
      }
      return out.length ? out : null;
    }
  }
  return null;
}

const centavos = (v: unknown) => Math.round(Number(String(v ?? "").replace(/[$,\s]/g, "")) * 100) || 0;

/**
 * The SAE export, read in the browser (the sheet is ~15 MB and a request may
 * carry 4.5): find the clave, PRECIO 4, último costo and ventas columns on
 * whichever sheet has them, compare in slices, show what changes, apply what
 * stays ticked. Stock never comes from here — the app keeps it.
 */
export function ImportarPrecios({ factorGrob }: { factorGrob: number | null }) {
  const [archivo, setArchivo] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState<string | null>(null);
  const [res, setRes] = useState<Resultado | null>(null);
  const [vista, setVista] = useState<"precios" | "costos" | "minimos" | "nuevas">("precios");
  const [fuera, setFuera] = useState<Set<string>>(new Set());
  const [conMinimos, setConMinimos] = useState(true);
  const [aplicando, setAplicando] = useState(false);
  // Grob's list: read, then waits for the factor (asked once, then remembered).
  const [grob, setGrob] = useState<FilaLista[] | null>(null);
  const [factor, setFactor] = useState(factorGrob ? String(factorGrob) : "");
  const [dando, setDando] = useState(false);
  const f = Number(factor.replace(",", "."));
  const factorOk = f > 0 && f < 10;

  async function leer(file: File) {
    setArchivo(file.name);
    setRes(null);
    setFuera(new Set());
    setGrob(null);
    setLeyendo("Leyendo el Excel…");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const deGrob = leerListaGrob(XLSX, wb);
      if (deGrob) {
        setGrob(deGrob);
        if (factorGrob) await comparar(deGrob.map((x) => ({ sku: x.sku, precio: Math.round(x.pl * factorGrob * 100), costo: 0, ventas: null })));
        return;
      }
      let mejor: { filas: FilaSae[]; puntos: number } = { filas: [], puntos: 0 };
      for (const nombre of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nombre], { header: 1, defval: "", raw: false });
        const enc = (rows[0] ?? []).map((h) => String(h).trim().toLowerCase());
        const col = (re: RegExp) => enc.findIndex((h) => re.test(h));
        const iClave = col(/^clave( de art[ií]culo)?$/);
        const iPrecio = col(/precio 4/);
        const iCosto = col(/[uú]ltimo costo/);
        const iVentas = col(/ventas anuales/);
        if (iClave < 0 || iPrecio < 0) continue;
        const puntos = 2 + (iCosto >= 0 ? 1 : 0) + (iVentas >= 0 ? 1 : 0);
        if (puntos <= mejor.puntos) continue;
        const vistos = new Set<string>();
        const filas: FilaSae[] = [];
        for (const r of rows.slice(1)) {
          const sku = String(r[iClave] ?? "").trim();
          if (!sku || vistos.has(sku)) continue;
          vistos.add(sku);
          filas.push({
            sku,
            precio: centavos(r[iPrecio]),
            costo: iCosto >= 0 ? centavos(r[iCosto]) : 0,
            ventas: iVentas >= 0 ? Number(String(r[iVentas]).replace(/,/g, "")) || 0 : null,
          });
        }
        mejor = { filas, puntos };
      }
      if (!mejor.filas.length) throw new Error('No encontré las columnas "Clave" y "PRECIO 4 CON IVA", ni "Codigo Catalogo" y "P.L." de Grob');
      await comparar(mejor.filas);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo leer el Excel");
      setArchivo(null);
    } finally {
      setLeyendo(null);
    }
  }

  async function comparar(filas: FilaSae[]) {
    const total: Resultado = { precios: [], costos: [], minimos: [], nuevas: [] };
    for (let i = 0; i < filas.length; i += 3000) {
      setLeyendo(`Comparando con la app… ${Math.min(i + 3000, filas.length).toLocaleString("es-MX")} de ${filas.length.toLocaleString("es-MX")}`);
      const r = unwrap(await compararSae(filas.slice(i, i + 3000)));
      total.precios.push(...r.precios);
      total.costos.push(...r.costos);
      total.minimos.push(...r.minimos);
      total.nuevas.push(...r.nuevas);
    }
    setRes(total);
    setVista(total.precios.length ? "precios" : total.costos.length ? "costos" : total.nuevas.length ? "nuevas" : "minimos");
  }

  async function compararLista() {
    if (!grob || !factorOk) return;
    try {
      await comparar(grob.map((x) => ({ sku: x.sku, precio: Math.round(x.pl * f * 100), costo: 0, ventas: null })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo comparar");
    } finally {
      setLeyendo(null);
    }
  }

  async function darDeAlta() {
    if (!res || !grob) return;
    setDando(true);
    try {
      const faltan = new Set(res.nuevas);
      const filas = grob.filter((x) => faltan.has(x.sku)).map((x) => ({ sku: x.sku, name: x.nombre || x.sku, precio: Math.round(x.pl * f * 100) }));
      let n = 0;
      for (let i = 0; i < filas.length; i += 2000) n += unwrap(await altaDesdeLista(filas.slice(i, i + 2000)));
      toast.success(`${n.toLocaleString("es-MX")} piezas dadas de alta con 0 piezas`);
      setRes({ ...res, nuevas: [] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron dar de alta");
    } finally {
      setDando(false);
    }
  }

  async function aplicar() {
    if (!res) return;
    setAplicando(true);
    try {
      const dentro = <T extends { sku: string }>(xs: T[], tipo: string) => xs.filter((x) => !fuera.has(`${tipo}:${x.sku}`));
      const n = unwrap(
        await aplicarSae({
          precios: dentro(res.precios, "precios"),
          costos: dentro(res.costos, "costos"),
          minimos: conMinimos ? res.minimos : [],
        }),
      );
      if (grob && factorOk) unwrap(await guardarFactor("grob", f));
      toast.success(`Listo: ${n.toLocaleString("es-MX")} cambios aplicados`);
      setRes(null);
      setArchivo(null);
      setGrob(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo aplicar");
    } finally {
      setAplicando(false);
    }
  }

  const lista = res ? (vista === "precios" ? res.precios : vista === "costos" ? res.costos : []) : [];
  const nPrecios = res ? res.precios.filter((x) => !fuera.has(`precios:${x.sku}`)).length : 0;
  const nCostos = res ? res.costos.filter((x) => !fuera.has(`costos:${x.sku}`)).length : 0;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/catalogo" className="text-sm">← Catálogo</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Importar precios</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          El export del SAE o la lista de Grob (Lista Plana, Comfort) tal como llega. Súbelo, revisa qué cambia y aplica. Carros, refacción y conversiones se editan en el Catálogo.
        </p>
      </div>

      <label className="flex cursor-pointer flex-wrap items-center gap-3 rounded-xl border border-dashed border-border bg-background p-4 hover:bg-muted/40">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800"><FileSpreadsheet className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{archivo ?? "Elige el Excel del SAE o de Grob (.xls o .xlsx)"}</span>
          <span className="block text-xs text-muted-foreground">SAE: precio = "PRECIO 4 CON IVA" · costo = "Último costo" · ventas anuales ÷ 12 = stock mínimo. Grob: precio = P.L. × factor</span>
        </span>
        <input type="file" accept=".xls,.xlsx" className="sr-only" onChange={(e) => e.target.files?.[0] && leer(e.target.files[0])} />
        <span className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium">{archivo ? "Cambiar archivo" : "Elegir archivo"}</span>
      </label>

      {grob && (
        <form
          className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-background p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void compararLista();
          }}
        >
          <div className="min-w-0 flex-1 text-sm">
            <b>Lista de Grob · {grob.length.toLocaleString("es-MX")} claves</b>
            <span className="block text-xs text-muted-foreground">
              Precio de venta = P.L. × factor. Se guarda: el mes que entra solo subes la lista.
              {factorOk && ` Ej. P.L. $100 → ${formatMXN(Math.round(100 * f * 100))}.`}
            </span>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Factor</span>
            <Input value={factor} onChange={(e) => setFactor(e.target.value)} inputMode="decimal" placeholder="1.16" className="w-28" aria-label="Factor sobre P.L." />
          </label>
          <Button type="submit" disabled={!factorOk || !!leyendo}>{res ? "Recalcular" : "Comparar"}</Button>
        </form>
      )}

      {leyendo && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {leyendo}</p>}

      {res && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi n={res.precios.length} label="precios cambian" />
            <Kpi n={res.costos.length} label="costos cambian" />
            <Kpi n={res.minimos.length} label="stock mínimo cambia" />
            <Kpi n={res.nuevas.length} label="claves que no están en la app" />
          </div>
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">Las existencias no se tocan: las lleva la app con cada venta y compra.</p>

          <div className="flex flex-wrap items-center gap-3">
            <div role="group" aria-label="Ver" className="inline-flex rounded-lg bg-muted p-0.5">
              {(
                [["precios", `Precios · ${res.precios.length}`], ["costos", `Costos · ${res.costos.length}`], ["nuevas", `Claves nuevas · ${res.nuevas.length}`]] as const
              ).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={vista === k} onClick={() => setVista(k)} className={cn("h-8 cursor-pointer rounded-md px-3 text-xs", vista === k ? "bg-background font-semibold shadow-sm" : "text-muted-foreground")}>
                  {l}
                </button>
              ))}
            </div>
            <label className="ml-auto flex items-center gap-2 text-sm">
              <input type="checkbox" checked={conMinimos} onChange={(e) => setConMinimos(e.target.checked)} className="h-4 w-4 accent-brand" />
              También poner stock mínimo = ventas anuales ÷ 12 ({res.minimos.length.toLocaleString("es-MX")})
            </label>
          </div>

          {vista === "nuevas" ? (
            <div className="rounded-xl border border-border bg-background p-4 text-sm">
              {grob ? (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="min-w-0 flex-1 text-muted-foreground">Vienen en la lista de Grob y no están en tu inventario (nuevas o que nunca has comprado). Dalas de alta con 0 piezas, con su descripción y su precio, y ya se pueden buscar, cotizar y pedir.</p>
                  {res.nuevas.length > 0 && (
                    <Button variant="brand" loading={dando} disabled={!factorOk} onClick={darDeAlta}>Dar de alta {res.nuevas.length.toLocaleString("es-MX")}</Button>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">Estas claves están en el SAE pero no en la app. No se dan de alta solas: créalas en Inventario si las vas a vender.</p>
              )}
              <p className="mt-2 max-h-80 overflow-y-auto font-mono text-xs leading-relaxed">{res.nuevas.slice(0, 3000).join(" · ") || "—"}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-background">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/50 text-left text-xs font-semibold text-muted-foreground">
                  <tr><th className="w-10 px-3 py-2"></th><th className="px-2">Clave</th><th className="px-2">Descripción</th><th className="px-2 text-right">Hoy en la app</th><th className="px-2 text-right">Excel</th><th className="px-3 text-right">Cambio</th></tr>
                </thead>
                <tbody>
                  {lista.slice(0, 500).map((x) => {
                    const k = `${vista}:${x.sku}`;
                    const pct = x.antes ? Math.round(((x.despues - x.antes) / x.antes) * 1000) / 10 : null;
                    return (
                      <tr key={k} className="border-t border-border/70">
                        <td className="px-3 py-2">
                          <input type="checkbox" aria-label={x.sku} checked={!fuera.has(k)} onChange={() => setFuera((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; })} className="h-4 w-4 accent-brand" />
                        </td>
                        <td className="px-2 font-mono text-xs font-semibold">{x.sku}</td>
                        <td className="max-w-80 truncate px-2">{x.name}</td>
                        <td className="px-2 text-right font-mono text-xs text-muted-foreground line-through">{formatMXN(x.antes)}</td>
                        <td className="px-2 text-right font-mono text-xs font-semibold">{formatMXN(x.despues)}</td>
                        <td className={cn("px-3 text-right text-xs font-semibold", pct !== null && pct > 0 ? "text-red-700" : "text-emerald-700")}>{pct === null ? "—" : `${pct > 0 ? "+" : ""}${pct}%`}</td>
                      </tr>
                    );
                  })}
                  {!lista.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Sin cambios aquí.</td></tr>}
                </tbody>
              </table>
              {lista.length > 500 && <p className="px-3 py-2 text-xs text-muted-foreground">Mostrando 500 de {lista.length.toLocaleString("es-MX")}; se aplican todos los palomeados.</p>}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => { setRes(null); setArchivo(null); setGrob(null); }}>Cancelar</Button>
            <Button variant="brand" loading={aplicando} disabled={!nPrecios && !nCostos && !(conMinimos && res.minimos.length)} onClick={aplicar}>
              Aplicar {nPrecios} precios y {nCostos} costos{conMinimos && res.minimos.length ? ` + ${res.minimos.length.toLocaleString("es-MX")} mínimos` : ""}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-background px-4 py-3">
      <div className="text-2xl font-bold">{n.toLocaleString("es-MX")}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
