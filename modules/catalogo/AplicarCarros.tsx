"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { unwrap } from "@/lib/errors";
import { aplicarCarros, detallePieza, type Carro, type PiezaDetalle } from "./actions";
import { FilaCarro, carroVacio, type CarroUI } from "./PiezaPanel";

type Fila = { carro: Carro; tienen: Set<string>; marcadas: Set<string>; nueva: boolean };
const clave = (c: Carro) => `${c.marca}|${c.modelo}|${c.desde}|${c.hasta}`.toLowerCase();
const MAX = 30;

/**
 * Cars × selected parts. Tick which parts each car fits: the oil filter keeps
 * the Vento and the air filter doesn't, without entering them one by one.
 */
export function AplicarCarros({
  skus,
  vehiculos,
  onClose,
  onListo,
}: {
  skus: string[];
  vehiculos: Record<string, string[]>;
  onClose: () => void;
  onListo: () => void;
}) {
  const piezasSkus = skus.slice(0, MAX);
  const [piezas, setPiezas] = useState<PiezaDetalle[] | null>(null);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [nuevo, setNuevo] = useState<CarroUI>(carroVacio());
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const ps: PiezaDetalle[] = [];
        for (const s of piezasSkus) ps.push(unwrap(await detallePieza(s)));
        const m = new Map<string, Fila>();
        for (const p of ps)
          for (const c of p.carros) {
            const f = m.get(clave(c)) ?? { carro: c, tienen: new Set<string>(), marcadas: new Set<string>(), nueva: false };
            f.tienen.add(p.sku);
            f.marcadas.add(p.sku);
            m.set(clave(c), f);
          }
        setPiezas(ps);
        setFilas([...m.values()].sort((a, b) => clave(a.carro).localeCompare(clave(b.carro))));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudieron abrir las piezas");
        onClose();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const marcar = (i: number, sku: string, on: boolean) =>
    setFilas((fs) => fs.map((f, j) => {
      if (j !== i) return f;
      const m = new Set(f.marcadas);
      if (on) m.add(sku);
      else m.delete(sku);
      return { ...f, marcadas: m };
    }));

  function agregar() {
    const desde = Number(nuevo.desde);
    if (!nuevo.marca.trim() || !nuevo.modelo.trim() || !desde) {
      toast.error("Pon armadora, modelo y años");
      return;
    }
    const carro: Carro = { ...nuevo, desde, hasta: Number(nuevo.hasta || nuevo.desde) };
    if (filas.some((f) => clave(f.carro) === clave(carro))) {
      toast.error("Ese carro ya está en la lista");
      return;
    }
    setFilas((fs) => [...fs, { carro, tienen: new Set(), marcadas: new Set(piezasSkus), nueva: true }]);
    setNuevo(carroVacio());
  }

  const cambiadas = filas.filter((f) => f.nueva || f.tienen.size !== f.marcadas.size || [...f.tienen].some((s) => !f.marcadas.has(s)));
  const resumen = piezas?.map((p) => {
    const mas = cambiadas.filter((f) => f.marcadas.has(p.sku) && !f.tienen.has(p.sku)).length;
    const menos = cambiadas.filter((f) => !f.marcadas.has(p.sku) && f.tienen.has(p.sku)).length;
    return mas || menos ? `${p.sku} ${mas ? `+${mas}` : ""}${mas && menos ? " " : ""}${menos ? `−${menos}` : ""}` : null;
  }).filter(Boolean);

  async function aplicar() {
    setAplicando(true);
    try {
      const r = unwrap(await aplicarCarros(piezasSkus, cambiadas.map((f) => ({ carro: f.carro, skus: [...f.marcadas] }))));
      toast.success(`Listo: ${r.agregados} carros agregados${r.quitados ? `, ${r.quitados} quitados` : ""}`);
      onListo();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo aplicar");
    } finally {
      setAplicando(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Carros de ${piezasSkus.length} piezas`} className="max-w-5xl">
      {!piezas ? (
        <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Abriendo las piezas…</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Palomea a qué piezas le queda cada carro. Quitar la palomita a un carro que ya tenía se lo quita a esa pieza.
            {skus.length > MAX && ` Solo las primeras ${MAX} piezas.`}
          </p>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs font-semibold text-muted-foreground">
                <tr>
                  <th className="sticky left-0 bg-muted px-3 py-2 text-left">Carro</th>
                  {piezas.map((p) => (
                    <th key={p.sku} className="min-w-28 px-2 py-2 text-center">
                      <span className="block font-mono">{p.sku}</span>
                      <span className="block truncate font-normal">{p.name.slice(0, 22)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={clave(f.carro)} className={cn("border-t border-border/70", f.nueva && "bg-emerald-50/70 dark:bg-emerald-950/20")}>
                    <td className="sticky left-0 bg-background px-3 py-2">
                      <b className="font-semibold">{f.carro.marca} {f.carro.modelo}</b>{" "}
                      {f.carro.version && <span className="text-muted-foreground">{f.carro.version} · </span>}
                      {f.carro.desde === f.carro.hasta ? f.carro.desde : `${f.carro.desde}–${f.carro.hasta}`}
                      {f.carro.cilindrada && ` · ${f.carro.cilindrada}`}
                      {f.nueva && <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-900">NUEVO</span>}
                    </td>
                    {piezas.map((p) => (
                      <td key={p.sku} className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          aria-label={`${f.carro.modelo} en ${p.sku}`}
                          checked={f.marcadas.has(p.sku)}
                          onChange={(e) => marcar(i, p.sku, e.target.checked)}
                          className="h-5 w-5 accent-brand"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
                {filas.length === 0 && (
                  <tr><td colSpan={piezas.length + 1} className="px-3 py-4 text-sm text-muted-foreground">Ninguna tiene carros todavía: agrégalos abajo.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 rounded-xl bg-muted/40 p-3">
            <datalist id="catalogo-armadoras">{Object.keys(vehiculos).map((a) => <option key={a} value={a} />)}</datalist>
            <FilaCarro
              c={nuevo}
              armadoras={Object.keys(vehiculos)}
              modelos={vehiculos[nuevo.marca] ?? []}
              editable
              onChange={(p) => setNuevo((x) => ({ ...x, ...p }))}
              onQuitar={() => setNuevo(carroVacio())}
            />
            <Button variant="secondary" onClick={agregar}>+ Agregar a todas</Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="mr-auto text-sm">
              {resumen && resumen.length ? <><b>Cambios:</b> {resumen.join(" · ")}</> : <span className="text-muted-foreground">Sin cambios todavía</span>}
            </span>
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button variant="brand" loading={aplicando} disabled={!cambiadas.length} onClick={aplicar}>
              Aplicar a {piezasSkus.length} piezas
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
