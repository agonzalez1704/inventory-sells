"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { toast } from "sonner";
import { Download, Upload, WandSparkles } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ComboSelect } from "@/components/ui/combo-select";
import { unwrap } from "@/lib/errors";
import { asignarEnLote, paginaCatalogo, reglaPorSku, renombrarPiezas, type OpcionesCatalogo } from "./actions";
import { compararCatalogo, leerHoja, type Diferencias, type FilaActual } from "./excel-diff";

const boton =
  "inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted";
const n = (x: number) => x.toLocaleString("es-MX");

/** Download the catalog, upload it corrected, or set a whole SKU prefix at once. */
export function HerramientasCatalogo({ opciones, onListo }: { opciones: OpcionesCatalogo; onListo: () => void }) {
  const router = useRouter();
  const { getToken } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [avance, setAvance] = useState<string | null>(null);
  const [dif, setDif] = useState<Diferencias | null>(null);
  const [regla, setRegla] = useState(false);

  // Comparing and applying take minutes: keep the session alive per call, as
  // the importer does (a throttled background tab signs the requests out).
  const sesion = () => getToken({ skipCache: true });

  async function leerActual(): Promise<Map<string, FilaActual>> {
    const actual = new Map<string, FilaActual>();
    for (let inicio = 0; ; inicio += 4) {
      await sesion();
      const paginas = await Promise.all([0, 1, 2, 3].map(async (j) => unwrap(await paginaCatalogo(inicio + j))));
      // Pages arrive oldest row first: the first row seen of a SKU is the one.
      for (const f of paginas.flat()) if (!actual.has(f.sku)) actual.set(f.sku, f);
      setAvance(`Comparando con el catálogo… ${n(actual.size)} piezas`);
      if (paginas[3].length < 1000) return actual;
    }
  }

  async function cargar(file: File) {
    setAvance("Leyendo el archivo…");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false });
      const filas = leerHoja(grid);
      if (!filas?.length) throw new Error('No encontré la columna "sku". Usa el archivo de "Descargar Excel".');
      setDif(compararCatalogo(filas, await leerActual(), opciones.familias, opciones.sistemas));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo leer el archivo");
    } finally {
      setAvance(null);
    }
  }

  async function aplicar(d: Diferencias) {
    const total = d.nombres.length + d.grupos.reduce((a, g) => a + g.skus.length, 0);
    let hechos = 0;
    const paso = (c: number) => setAvance(`Aplicando… ${n((hechos += c))} de ${n(total)}`);
    setDif(null);
    paso(0);
    try {
      // Names first: renaming re-derives a refacción not fixed by hand, so the
      // refacción from the file has to land after it.
      for (let i = 0; i < d.nombres.length; i += 100) {
        await sesion();
        const lote = d.nombres.slice(i, i + 100);
        unwrap(await renombrarPiezas(lote));
        paso(lote.length);
      }
      for (const g of d.grupos) {
        for (let i = 0; i < g.skus.length; i += 500) {
          await sesion();
          const lote = g.skus.slice(i, i + 500);
          unwrap(await asignarEnLote(lote, g.campo, g.valor));
          paso(lote.length);
        }
      }
      toast.success(`Catálogo actualizado · ${n(total)} cambios`);
      onListo();
      router.refresh();
    } catch (e) {
      // Each batch commits on its own, and uploading the file again only sends
      // what is still different.
      toast.error(`Se cortó en ${n(hechos)} de ${n(total)}. Vuelve a cargar el archivo para terminar.`, { duration: Infinity });
      console.error(e);
    } finally {
      setAvance(null);
    }
  }

  const sinCambios = dif && dif.nombres.length + dif.grupos.length === 0;

  return (
    <>
      <a href="/api/catalogo/excel" className={boton}>
        <Download className="h-4 w-4" />
        Descargar Excel
      </a>
      <button type="button" className={boton} disabled={avance !== null} onClick={() => input.current?.click()}>
        <Upload className="h-4 w-4" />
        {avance ?? "Cargar Excel"}
      </button>
      <input
        ref={input}
        type="file"
        accept=".xlsx,.xls"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void cargar(f);
        }}
      />
      <button type="button" className={boton} onClick={() => setRegla(true)}>
        <WandSparkles className="h-4 w-4" />
        Regla por SKU
      </button>

      {dif && (
        <Modal open onClose={() => setDif(null)} title="Revisar antes de aplicar" className="max-w-md">
          <div className="space-y-3 text-sm">
            {sinCambios ? (
              <p className="text-muted-foreground">El archivo es igual a lo que ya tiene el sistema. No hay nada que cambiar.</p>
            ) : (
              <dl className="divide-y divide-border rounded-xl border border-border">
                {(
                  [
                    ["Nombres", dif.conteo.nombres],
                    ["Marca", dif.conteo.marca],
                    ["Refacción", dif.conteo.refaccion],
                    ["Sistema", dif.conteo.sistema],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="flex justify-between px-3 py-2">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="font-semibold tabular-nums">{n(v)}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="text-xs text-muted-foreground">
              Las celdas vacías no borran nada. La columna de carros no se carga.
            </p>
            {dif.desconocidas.length > 0 && (
              <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <b>No existen y se omiten:</b> {dif.desconocidas.slice(0, 12).join(", ")}
                {dif.desconocidas.length > 12 && ` y ${n(dif.desconocidas.length - 12)} más`}. Revisa cómo están escritas.
              </p>
            )}
            {dif.noEncontrados.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {n(dif.noEncontrados.length)} SKU del archivo no están en el sistema y se omiten: {dif.noEncontrados.slice(0, 6).join(", ")}
                {dif.noEncontrados.length > 6 && "…"}
              </p>
            )}
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button type="button" variant="ghost" onClick={() => setDif(null)}>
                Cerrar
              </Button>
              {!sinCambios && <Button type="button" onClick={() => void aplicar(dif)}>Aplicar cambios</Button>}
            </div>
          </div>
        </Modal>
      )}

      {regla && (
        <ReglaModal
          opciones={opciones}
          onClose={() => setRegla(false)}
          onListo={() => {
            setRegla(false);
            onListo();
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function ReglaModal({
  opciones,
  onClose,
  onListo,
}: {
  opciones: OpcionesCatalogo;
  onClose: () => void;
  onListo: () => void;
}) {
  const [prefijo, setPrefijo] = useState("");
  const [familia, setFamilia] = useState("");
  const [sistema, setSistema] = useState("");
  const [soloVacias, setSoloVacias] = useState(true);
  const [cuenta, setCuenta] = useState<{ refaccion: number; sistema: number } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function correr(aplicar: boolean) {
    setOcupado(true);
    try {
      const r = unwrap(await reglaPorSku({ prefijo, familia: familia || null, sistema: sistema || null, soloVacias, aplicar }));
      if (aplicar) {
        toast.success(`Regla aplicada a ${prefijo.toUpperCase()}…`);
        onListo();
      } else setCuenta(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo");
    } finally {
      setOcupado(false);
    }
  }

  // Any edit invalidates the count: nothing applies without seeing its number.
  const cambiar = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setCuenta(null);
  };

  return (
    <Modal open onClose={onClose} title="Regla por SKU" className="max-w-sm">
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">El SKU empieza con</span>
          <Input value={prefijo} onChange={(e) => cambiar(setPrefijo)(e.target.value.toUpperCase())} placeholder="SAN" autoFocus />
        </label>
        <div>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Refacción</span>
          <ComboSelect
            aria-label="Refacción"
            valor={familia}
            vacio="No cambiar"
            opciones={opciones.familias.map((f) => ({ value: f.id, label: f.nombre }))}
            onChange={(v) => {
              cambiar(setFamilia)(v);
              // The refacción already knows its sistema: amortiguador → suspensión.
              const s = opciones.familias.find((f) => f.id === v)?.sistema;
              if (s) setSistema(s);
            }}
          />
        </div>
        <div>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Sistema</span>
          <ComboSelect
            aria-label="Sistema"
            valor={sistema}
            vacio="No cambiar"
            opciones={opciones.sistemas.map((s) => ({ value: s.id, label: s.nombre }))}
            onChange={cambiar(setSistema)}
          />
        </div>
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={soloVacias}
            onChange={(e) => cambiar(setSoloVacias)(e.target.checked)}
            className="mt-0.5 h-4 w-4 cursor-pointer accent-[hsl(var(--accent))]"
          />
          <span>
            No tocar lo que ya asigné a mano
            <span className="block text-xs text-muted-foreground">Quítalo solo si quieres reemplazar todo lo de ese prefijo.</span>
          </span>
        </label>
        {cuenta && (
          <p className="rounded-lg bg-muted p-2.5 text-[13px]">
            Cambiaría <b className="tabular-nums">{n(cuenta.refaccion)}</b> en refacción y{" "}
            <b className="tabular-nums">{n(cuenta.sistema)}</b> en sistema. Cuenta una por inventario: una pieza en dos almacenes son dos.
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={ocupado}>
            Cancelar
          </Button>
          {cuenta && cuenta.refaccion + cuenta.sistema > 0 ? (
            <Button type="button" loading={ocupado} onClick={() => void correr(true)}>
              Aplicar
            </Button>
          ) : (
            <Button type="button" variant="secondary" loading={ocupado} disabled={prefijo.trim().length < 2 || (!familia && !sistema)} onClick={() => void correr(false)}>
              Ver cuántas
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
