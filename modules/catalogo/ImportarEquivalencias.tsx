"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { toast } from "sonner";
import { ArrowLeftRight } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { unwrap } from "@/lib/errors";
import { armarTabla, leerEquivalencias, type FilaEquivalencia, type Resumen } from "./equivalencias-excel";
import { aplicarEquivalencias, equivalenciasActuales, publicarEquivalencias, subirEquivalencias, type PasoAplicar } from "./equivalencias-actions";

const boton =
  "inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted";
const n = (x: number) => x.toLocaleString("es-MX");

type Listo = { archivo: string; marcas: string[]; filas: FilaEquivalencia[]; resumen: Resumen };

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
  const [avance, setAvance] = useState<string | null>(null);
  const [listo, setListo] = useState<Listo | null>(null);
  // Long runs: keep the session alive per call, as the other importers do.
  const sesion = () => getToken({ skipCache: true });

  async function leer(file: File) {
    setAvance("Leyendo el archivo…");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: true });
      const leido = leerEquivalencias(grid);
      if (!leido?.renglones.length)
        throw new Error('No encontré columnas de marca. La primera fila debe decir la marca de cada columna, p. ej. "Codigo GROB".');
      setAvance("Comparando con lo que ya hay…");
      await sesion();
      const actual = unwrap(await equivalenciasActuales());
      const { filas, resumen } = armarTabla(leido.renglones, actual, () => crypto.randomUUID());
      setListo({ archivo: file.name, marcas: leido.marcas, filas, resumen });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo leer el archivo");
    } finally {
      setAvance(null);
    }
  }

  async function aplicar({ filas }: Listo) {
    setListo(null);
    const lote = crypto.randomUUID();
    try {
      for (let i = 0; i < filas.length; i += 4000) {
        setAvance(`Subiendo… ${n(Math.min(i + 4000, filas.length))} de ${n(filas.length)}`);
        await sesion();
        unwrap(await subirEquivalencias(lote, filas.slice(i, i + 4000)));
      }
      setAvance("Publicando la tabla…");
      await sesion();
      unwrap(await publicarEquivalencias(lote));
      // Every product re-derives its group from its SKU, a page at a time.
      let despues: string | null = null;
      let vistos = 0;
      let ligados = 0;
      for (;;) {
        await sesion();
        const paso: PasoAplicar = unwrap(await aplicarEquivalencias(despues));
        if (!paso.vistos) break;
        vistos += paso.vistos;
        ligados += paso.ligados;
        despues = paso.ultimo;
        setAvance(`Ligando productos… ${n(vistos)} revisados`);
      }
      toast.success(`Equivalencias cargadas · ${n(ligados)} productos quedaron con conversiones`);
      onListo();
      router.refresh();
    } catch (e) {
      // Publishing is all-or-nothing; linking is idempotent, so loading the
      // same file again finishes the job.
      toast.error("Se cortó la carga. Vuelve a cargar el mismo archivo para terminar.", { duration: Infinity });
      console.error(e);
    } finally {
      setAvance(null);
    }
  }

  return (
    <>
      <button type="button" className={boton} disabled={avance !== null} onClick={() => input.current?.click()}>
        <ArrowLeftRight className="h-4 w-4" />
        {avance ?? "Cargar equivalencias"}
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

      {listo && (
        <Modal open onClose={() => setListo(null)} title="Revisar antes de cargar" className="max-w-md">
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              <b className="text-foreground">{listo.archivo}</b> · {n(listo.resumen.renglones)} renglones forman{" "}
              <b className="text-foreground">{n(listo.resumen.grupos)}</b> piezas equivalentes.
            </p>
            <dl className="divide-y divide-border rounded-xl border border-border">
              {listo.resumen.porMarca.map(({ marca, claves }) => (
                <div key={marca} className="flex justify-between px-3 py-2">
                  <dt className="text-muted-foreground">{marca}</dt>
                  <dd className="font-semibold tabular-nums">{n(claves)}</dd>
                </div>
              ))}
            </dl>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>Reemplaza la tabla completa. Buscar cualquiera de estos números encuentra todas las piezas de su renglón que tengamos.</li>
              {listo.resumen.manuales > 0 && <li>{n(listo.resumen.manuales)} claves ligadas a mano en Catálogo se conservan.</li>}
              {listo.resumen.quitadas > 0 && (
                <li className="text-amber-700 dark:text-amber-300">
                  {n(listo.resumen.quitadas)} números de la carga anterior no vienen en este archivo y se quitan.
                </li>
              )}
              <li>Tarda unos minutos: después de publicar se revisa cada producto.</li>
            </ul>
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button type="button" variant="ghost" onClick={() => setListo(null)}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => void aplicar(listo)}>
                Cargar equivalencias
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
