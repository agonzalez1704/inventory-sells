"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeftRight, Check, Circle, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { unwrap } from "@/lib/errors";
import { armarTabla, leerEquivalencias, type FilaEquivalencia, type Resumen } from "./equivalencias-excel";
import {
  aplicarEquivalencias,
  contarProductos,
  equivalenciasActuales,
  publicarEquivalencias,
  subirEquivalencias,
  type PasoAplicar,
} from "./equivalencias-actions";

const boton =
  "inline-flex h-9 cursor-pointer items-center gap-2 whitespace-nowrap px-3 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-wait disabled:opacity-60";
const n = (x: number) => x.toLocaleString("es-MX");

type Archivo = { nombre: string; filas: FilaEquivalencia[]; resumen: Resumen };

// The load is one flow in one dialog: read → review → upload → publish → link
// every product → done. It takes minutes, so every step shows where it is and
// the end says plainly that it worked (or what to do if it didn't).
type Paso = "subir" | "publicar" | "ligar";
const PASOS: { id: Paso; titulo: string }[] = [
  { id: "subir", titulo: "Subir el archivo" },
  { id: "publicar", titulo: "Reemplazar la tabla" },
  { id: "ligar", titulo: "Ligar los productos" },
];

type Estado =
  | { fase: "leyendo"; texto: string }
  | { fase: "revisar"; archivo: Archivo }
  | { fase: "cargando"; archivo: Archivo; paso: Paso; hecho: number; total: number }
  | { fase: "listo"; archivo: Archivo; ligados: number; segundos: number }
  | { fase: "error"; archivo: Archivo; paso: Paso; mensaje: string };

/**
 * Catálogo → "Cargar equivalencias": the owner's table of the same part under
 * every brand (CNV.xlsx). Replaces the whole table; links made by hand stay.
 * After it, a search for any number — SYD included — finds every part of its
 * row the shop carries, and products loaded later join their row by SKU.
 */
export function ImportarEquivalencias({ onListo }: { onListo: () => void }) {
  const router = useRouter();
  const { getToken } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<Estado | null>(null);
  // Long runs: keep the session alive per call, as the other importers do.
  const sesion = () => getToken({ skipCache: true });
  const ocupado = estado?.fase === "leyendo" || estado?.fase === "cargando";

  // Leaving mid-load cuts it; the browser asks first.
  useEffect(() => {
    if (estado?.fase !== "cargando") return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [estado?.fase]);

  async function leer(file: File) {
    setEstado({ fase: "leyendo", texto: "Leyendo el archivo…" });
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: true });
      const leido = leerEquivalencias(grid);
      if (!leido?.renglones.length)
        throw new Error('No encontré columnas de marca. La primera fila debe decir la marca de cada columna, p. ej. "Codigo GROB".');
      setEstado({ fase: "leyendo", texto: "Comparando con lo que ya hay…" });
      await sesion();
      const actual = unwrap(await equivalenciasActuales());
      const { filas, resumen } = armarTabla(leido.renglones, actual, () => crypto.randomUUID());
      setEstado({ fase: "revisar", archivo: { nombre: file.name, filas, resumen } });
    } catch (e) {
      setEstado(null);
      toast.error(e instanceof Error ? e.message : "No se pudo leer el archivo");
    }
  }

  async function cargar(archivo: Archivo, desde: Paso = "subir") {
    const inicio = Date.now();
    const { filas } = archivo;
    let paso: Paso = desde;
    const avance = (p: Paso, hecho: number, total: number) => setEstado({ fase: "cargando", archivo, paso: p, hecho, total });
    try {
      if (desde === "subir") {
        const lote = crypto.randomUUID();
        for (let i = 0; i < filas.length; i += 4000) {
          avance("subir", i, filas.length);
          await sesion();
          unwrap(await subirEquivalencias(lote, filas.slice(i, i + 4000)));
        }
        paso = "publicar";
        avance("publicar", 0, 1);
        await sesion();
        unwrap(await publicarEquivalencias(lote));
      }
      // Every product re-derives its group from its SKU, a page at a time.
      // Safe to repeat, which is what "Reintentar" does after a cut.
      paso = "ligar";
      await sesion();
      const total = unwrap(await contarProductos());
      let despues: string | null = null;
      let revisados = 0;
      let ligados = 0;
      avance("ligar", 0, total);
      for (;;) {
        await sesion();
        const r: PasoAplicar = unwrap(await aplicarEquivalencias(despues));
        if (!r.vistos) break;
        revisados += r.vistos;
        ligados += r.ligados;
        despues = r.ultimo;
        avance("ligar", revisados, Math.max(total, revisados));
      }
      setEstado({ fase: "listo", archivo, ligados, segundos: Math.round((Date.now() - inicio) / 1000) });
      onListo();
      router.refresh();
    } catch (e) {
      console.error(e);
      setEstado({ fase: "error", archivo, paso, mensaje: e instanceof Error ? e.message : "Se cortó la conexión" });
    }
  }

  const cerrar = () => {
    if (!ocupado) setEstado(null);
  };

  return (
    <>
      <button type="button" className={boton} disabled={ocupado} onClick={() => input.current?.click()}>
        {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
        {estado?.fase === "leyendo" ? estado.texto : estado?.fase === "cargando" ? "Cargando equivalencias…" : "Cargar equivalencias"}
      </button>
      <input
        ref={input}
        type="file"
        accept=".xlsx,.xls"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void leer(f);
        }}
      />

      {estado && estado.fase !== "leyendo" && (
        <Modal
          open
          onClose={cerrar}
          title={
            estado.fase === "revisar"
              ? "Revisar antes de cargar"
              : estado.fase === "listo"
                ? "Equivalencias cargadas"
                : estado.fase === "error"
                  ? "La carga se detuvo"
                  : "Cargando equivalencias"
          }
          className="max-w-md"
        >
          <div className="space-y-4 text-sm">
            {estado.fase === "revisar" && (
              <Revisar archivo={estado.archivo} onCancelar={cerrar} onCargar={() => void cargar(estado.archivo)} />
            )}

            {(estado.fase === "cargando" || estado.fase === "error") && (
              <>
                <ol className="space-y-3">
                  {PASOS.map((p, i) => {
                    const actual = PASOS.findIndex((x) => x.id === estado.paso);
                    const situacion =
                      i < actual ? "hecho" : i > actual ? "pendiente" : estado.fase === "error" ? "error" : "activo";
                    return (
                      <li key={p.id} className="flex gap-3">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                          {situacion === "hecho" && (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white">
                              <Check className="h-3 w-3" strokeWidth={3} />
                            </span>
                          )}
                          {situacion === "activo" && <Loader2 className="h-5 w-5 animate-spin text-brand" />}
                          {situacion === "error" && <AlertTriangle className="h-5 w-5 text-red-600" />}
                          {situacion === "pendiente" && <Circle className="h-4 w-4 text-muted-foreground/40" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={cn("font-medium", situacion === "pendiente" && "text-muted-foreground")}>{p.titulo}</p>
                          {situacion === "activo" && estado.fase === "cargando" && (
                            <Barra paso={p.id} hecho={estado.hecho} total={estado.total} />
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
                {estado.fase === "cargando" ? (
                  <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                    Tarda unos minutos. No cierres ni recargues esta pestaña hasta que termine.
                  </p>
                ) : (
                  <>
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-900 dark:bg-red-950/40 dark:text-red-200">
                      {estado.mensaje}. Lo que ya se hizo queda guardado: reintentar sigue desde este paso.
                    </p>
                    <div className="flex justify-end gap-2 border-t border-border pt-3">
                      <Button type="button" variant="ghost" onClick={cerrar}>
                        Cerrar
                      </Button>
                      <Button
                        type="button"
                        onClick={() => void cargar(estado.archivo, estado.paso === "ligar" ? "ligar" : "subir")}
                      >
                        Reintentar
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}

            {estado.fase === "listo" && (
              <>
                <div className="flex flex-col items-center gap-2 py-2 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <Check className="h-6 w-6" strokeWidth={3} />
                  </span>
                  <p className="text-base font-semibold">Listo: la tabla quedó cargada</p>
                  <p className="text-xs text-muted-foreground">
                    {estado.archivo.nombre} ·{" "}
                    {estado.segundos < 90 ? `${estado.segundos} s` : `${Math.round(estado.segundos / 60)} min`}
                  </p>
                </div>
                <dl className="grid grid-cols-3 divide-x divide-border rounded-xl border border-border text-center">
                  <Dato valor={estado.archivo.resumen.grupos} etiqueta="piezas equivalentes" />
                  <Dato valor={estado.archivo.filas.length} etiqueta="números" />
                  <Dato valor={estado.ligados} etiqueta="productos con conversiones" />
                </dl>
                <p className="text-xs text-muted-foreground">
                  Ya se puede buscar por cualquier número del archivo, SYD incluido, en el POS, la tienda y el inventario.
                </p>
                <div className="flex justify-end border-t border-border pt-3">
                  <Button type="button" onClick={cerrar}>
                    Entendido
                  </Button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

function Revisar({ archivo, onCancelar, onCargar }: { archivo: Archivo; onCancelar: () => void; onCargar: () => void }) {
  const { resumen } = archivo;
  return (
    <>
      <p className="text-muted-foreground">
        <b className="text-foreground">{archivo.nombre}</b> · {n(resumen.renglones)} renglones forman{" "}
        <b className="text-foreground">{n(resumen.grupos)}</b> piezas equivalentes.
      </p>
      <dl className="divide-y divide-border rounded-xl border border-border">
        {resumen.porMarca.map(({ marca, claves }) => (
          <div key={marca} className="flex justify-between px-3 py-2">
            <dt className="text-muted-foreground">{marca}</dt>
            <dd className="font-semibold tabular-nums">{n(claves)}</dd>
          </div>
        ))}
      </dl>
      <ul className="space-y-1 text-xs text-muted-foreground">
        <li>Reemplaza la tabla completa. Buscar cualquiera de estos números encuentra todas las piezas de su renglón que tengamos.</li>
        {resumen.manuales > 0 && <li>{n(resumen.manuales)} claves ligadas a mano en Catálogo se conservan.</li>}
        {resumen.quitadas > 0 && (
          <li className="text-amber-700 dark:text-amber-300">
            {n(resumen.quitadas)} números de la carga anterior no vienen en este archivo y se quitan.
          </li>
        )}
      </ul>
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button type="button" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="button" onClick={onCargar}>
          Cargar equivalencias
        </Button>
      </div>
    </>
  );
}

function Barra({ paso, hecho, total }: { paso: Paso; hecho: number; total: number }) {
  // Publishing is one call: an indeterminate bar, not a fake percentage.
  const pct = paso === "publicar" || !total ? null : Math.min(100, Math.round((hecho / total) * 100));
  return (
    <div className="mt-1.5 space-y-1">
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full bg-brand transition-[width] duration-500", pct === null && "w-1/3 animate-pulse")}
          style={pct === null ? undefined : { width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <p className="text-xs tabular-nums text-muted-foreground">
        {paso === "subir" && `${n(hecho)} de ${n(total)} números`}
        {paso === "publicar" && "Un momento…"}
        {paso === "ligar" && `${n(hecho)} de ${n(total)} productos revisados · ${pct ?? 0}%`}
      </p>
    </div>
  );
}

function Dato({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <div className="px-2 py-3">
      <dd className="text-lg font-semibold tabular-nums">{n(valor)}</dd>
      <dt className="text-[11px] leading-tight text-muted-foreground">{etiqueta}</dt>
    </div>
  );
}
