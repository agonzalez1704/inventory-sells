"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Search, X } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useIsMobile } from "@/components/use-is-mobile";
import { cn } from "@/lib/utils";
import { unwrap } from "@/lib/errors";
import { formatMXN } from "@/lib/money";
import { quisoDecir } from "@/lib/search";
import {
  buscarCatalogo,
  desligarConversion,
  detallePieza,
  guardarPieza,
  ligarConversion,
  type Carro,
  type FilaCatalogo,
  type OpcionesCatalogo,
  type PiezaDetalle,
} from "./actions";

// marcaAuto: the armadora was filled from the modelo, so a new modelo may replace it.
export type CarroUI = Omit<Carro, "desde" | "hasta"> & { desde: string; hasta: string; key: number; marcaAuto?: boolean };

let siguiente = 0;
export const aUI = (c: Carro): CarroUI => ({ ...c, desde: String(c.desde), hasta: String(c.hasta), key: siguiente++ });
export const carroVacio = (): CarroUI => ({ marca: "", modelo: "", version: null, cilindrada: null, condicion: null, desde: "", hasta: "", key: siguiente++ });

/** One part: refacción, sistema, marca, its cars and its conversiones. */
export function PiezaPanel({
  sku,
  opciones,
  puedeEditar,
  autopartes,
  onClose,
  onGuardado,
}: {
  sku: string | null;
  opciones: OpcionesCatalogo;
  puedeEditar: boolean;
  autopartes: boolean;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const isMobile = useIsMobile();
  const [p, setP] = useState<PiezaDetalle | null>(null);
  const [familia, setFamilia] = useState("");
  const [sistema, setSistema] = useState("");
  const [brand, setBrand] = useState("");
  const [carros, setCarros] = useState<CarroUI[]>([]);
  const [numeros, setNumeros] = useState<string[]>([]);
  const [tab, setTab] = useState<"carros" | "conv">(autopartes ? "carros" : "conv");
  const [guardando, setGuardando] = useState(false);

  async function cargar(s: string) {
    try {
      const d = unwrap(await detallePieza(s));
      setP(d);
      setFamilia(d.familia ?? "");
      setSistema(d.sistema ?? "");
      setBrand(d.brand ?? "");
      setCarros(d.carros.map(aUI));
      setNumeros(d.numeros);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo abrir");
      onClose();
    }
  }

  useEffect(() => {
    setP(null);
    setTab(autopartes ? "carros" : "conv");
    if (sku) cargar(sku);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sku]);

  async function guardar() {
    if (!p) return;
    setGuardando(true);
    try {
      unwrap(
        await guardarPieza({
          sku: p.sku,
          familia: familia || null,
          sistema: sistema || null,
          brand: brand || null,
          carros: autopartes
            ? carros
                .filter((c) => c.marca.trim() || c.modelo.trim())
                .map((c) => ({ ...c, desde: Number(c.desde), hasta: Number(c.hasta || c.desde) }))
            : null,
          numeros,
        }),
      );
      toast.success("Guardado");
      onGuardado();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  const cambiar = (key: number, parcial: Partial<CarroUI>) => setCarros((cs) => cs.map((c) => (c.key === key ? { ...c, ...parcial } : c)));

  return (
    <Drawer open={sku !== null} onOpenChange={(o) => !o && onClose()} swipeDirection={isMobile ? "down" : "right"} showSwipeHandle={isMobile}>
      <DrawerContent className="data-[swipe-direction=down]:h-[94dvh] data-[swipe-direction=right]:w-[min(56rem,96vw)]">
        {!p ? (
          <p className="flex items-center gap-2 px-5 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Abriendo la pieza…
          </p>
        ) : (
          <>
            <DrawerHeader className="gap-0 pb-0 pt-4">
              <div className="font-mono text-xs font-bold text-brand-foreground">{p.sku}</div>
              <DrawerTitle className="text-base font-bold leading-snug">{p.name}</DrawerTitle>
              <p className="text-xs text-muted-foreground">
                {p.price_cents ? formatMXN(p.price_cents) : "Sin precio"} · {p.quantity} en existencia · el precio llega del SAE
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <Campo label="Refacción">
                  <Select value={familia} disabled={!puedeEditar} onChange={(e) => setFamilia(e.target.value)}>
                    <option value="">Sin refacción</option>
                    {opciones.familias.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                  </Select>
                </Campo>
                <Campo label="Sistema">
                  <Select value={sistema} disabled={!puedeEditar} onChange={(e) => setSistema(e.target.value)}>
                    <option value="">{familia ? "El de la refacción" : "Sin sistema"}</option>
                    {opciones.sistemas.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </Select>
                </Campo>
                <Campo label="Marca de la pieza">
                  <input
                    list="catalogo-marcas"
                    value={brand}
                    disabled={!puedeEditar}
                    onChange={(e) => setBrand(e.target.value.toUpperCase())}
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-base outline-hidden focus:border-ring lg:text-sm"
                  />
                  <datalist id="catalogo-marcas">{opciones.marcas.map((m) => <option key={m} value={m} />)}</datalist>
                </Campo>
              </div>
              <div role="tablist" className="mt-3 flex gap-5 border-b border-border">
                {autopartes && (
                  <Tab on={tab === "carros"} onClick={() => setTab("carros")}>Carros · {carros.length}</Tab>
                )}
                <Tab on={tab === "conv"} onClick={() => setTab("conv")}>Conversiones · {p.conversiones.length}</Tab>
              </div>
            </DrawerHeader>

            <div data-base-ui-swipe-ignore className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
              {tab === "carros" ? (
                <div className="space-y-2">
                  <ListasCarro vehiculos={opciones.vehiculos} />
                  {carros.length === 0 && <p className="py-4 text-sm text-muted-foreground">Sin carros: esta pieza no sale cuando buscan por vehículo.</p>}
                  {carros.map((c) => (
                    <FilaCarro
                      key={c.key}
                      c={c}
                      vehiculos={opciones.vehiculos}
                      editable={puedeEditar}
                      onChange={(x) => cambiar(c.key, x)}
                      onQuitar={() => setCarros((cs) => cs.filter((x) => x.key !== c.key))}
                    />
                  ))}
                  {puedeEditar && (
                    <Button variant="secondary" onClick={() => setCarros((cs) => [...cs, carroVacio()])}>
                      + Agregar carro
                    </Button>
                  )}
                </div>
              ) : (
                <Conversiones p={p} puedeEditar={puedeEditar} numeros={numeros} setNumeros={setNumeros} onCambio={() => cargar(p.sku)} />
              )}
            </div>

            {puedeEditar && (
              <div className="flex shrink-0 items-center gap-2 border-t border-border px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                <span className="mr-auto hidden text-xs text-muted-foreground sm:block">Lo usan el POS, la tienda y el agente de WhatsApp.</span>
                <Button variant="secondary" onClick={onClose}>Descartar</Button>
                <Button variant="brand" loading={guardando} onClick={guardar}>Guardar</Button>
              </div>
            )}
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Tab({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={cn("-mb-px h-10 cursor-pointer border-b-2 text-sm", on ? "border-brand font-semibold" : "border-transparent text-muted-foreground")}
    >
      {children}
    </button>
  );
}

const CAMPO = "h-10 w-full min-w-0 rounded-lg border border-border bg-background px-2.5 text-base outline-hidden focus:border-ring disabled:opacity-70 lg:text-sm";

/** The armadora and all-models suggestion lists, once per screen. */
export function ListasCarro({ vehiculos }: { vehiculos: Record<string, string[]> }) {
  return (
    <>
      <datalist id="catalogo-armadoras">{Object.keys(vehiculos).map((a) => <option key={a} value={a} />)}</datalist>
      <datalist id="catalogo-modelos">
        {Object.entries(vehiculos).flatMap(([a, ms]) => ms.map((m) => <option key={`${a}|${m}`} value={m}>{a}</option>))}
      </datalist>
    </>
  );
}

const igual = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * One car: Modelo · Armadora · Versión · Cilindrada · Condición · Años. The
 * armadora is optional to type: a modelo only one armadora makes fills it
 * ("Versa" → Nissan); one several make asks which.
 */
export function FilaCarro({
  c,
  vehiculos,
  editable,
  onChange,
  onQuitar,
}: {
  c: CarroUI;
  vehiculos: Record<string, string[]>;
  editable: boolean;
  onChange: (p: Partial<CarroUI>) => void;
  onQuitar: () => void;
}) {
  const armadoras = Object.keys(vehiculos);
  const modelos = c.marca ? vehiculos[c.marca] ?? [] : Object.values(vehiculos).flat();
  const libre = !c.marca || c.marcaAuto;
  const de = (modelo: string) => armadoras.filter((a) => vehiculos[a].some((m) => igual(m, modelo)));
  const duenos = libre && c.modelo ? de(c.modelo) : [];

  function cambiarModelo(v: string) {
    if (!libre) return onChange({ modelo: v });
    const ds = de(v);
    if (ds.length === 1) onChange({ modelo: vehiculos[ds[0]].find((m) => igual(m, v))!, marca: ds[0], marcaAuto: true });
    else onChange({ modelo: v, marca: "", marcaAuto: false });
  }

  const sugArmadora = c.marca ? quisoDecir(c.marca, armadoras) : null;
  const sugModelo = c.modelo && !sugArmadora && !duenos.length ? quisoDecir(c.modelo, modelos) : null;
  const sinAnios = !c.desde;
  const lista = `modelos-${c.key}`;
  return (
    <div className={cn("rounded-xl border p-2", sugArmadora || sugModelo ? "border-amber-300 bg-amber-50/60 dark:bg-amber-950/20" : "border-border")}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_0.8fr_0.8fr_1fr_auto_auto]">
        <input aria-label="Modelo" placeholder="Modelo" list={c.marca ? lista : "catalogo-modelos"} value={c.modelo} disabled={!editable} onChange={(e) => cambiarModelo(e.target.value)} className={CAMPO} />
        {c.marca && <datalist id={lista}>{modelos.map((m) => <option key={m} value={m} />)}</datalist>}
        <input aria-label="Armadora" placeholder="Armadora (sola)" list="catalogo-armadoras" value={c.marca} disabled={!editable} onChange={(e) => onChange({ marca: e.target.value, marcaAuto: false })} className={CAMPO} />
        <input aria-label="Versión" placeholder="Versión" value={c.version ?? ""} disabled={!editable} onChange={(e) => onChange({ version: e.target.value })} className={CAMPO} />
        <input aria-label="Cilindrada" placeholder="1.6L" value={c.cilindrada ?? ""} disabled={!editable} onChange={(e) => onChange({ cilindrada: e.target.value })} className={CAMPO} />
        <input aria-label="Condición" placeholder="Condición" value={c.condicion ?? ""} disabled={!editable} onChange={(e) => onChange({ condicion: e.target.value })} className={CAMPO} />
        <span className="flex items-center gap-1">
          <input aria-label="Año desde" placeholder="desde" inputMode="numeric" value={c.desde} disabled={!editable} onChange={(e) => onChange({ desde: e.target.value.replace(/\D/g, "").slice(0, 4) })} className={cn(CAMPO, "w-[4.5rem] text-center", sinAnios && "border-red-400")} />
          –
          <input aria-label="Año hasta" placeholder="hasta" inputMode="numeric" value={c.hasta} disabled={!editable} onChange={(e) => onChange({ hasta: e.target.value.replace(/\D/g, "").slice(0, 4) })} className={cn(CAMPO, "w-[4.5rem] text-center")} />
        </span>
        {editable && (
          <button type="button" aria-label="Quitar carro" onClick={onQuitar} className="flex h-10 w-10 cursor-pointer items-center justify-center justify-self-end rounded-lg text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {editable && duenos.length > 1 && !c.marca && (
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">¿De qué armadora?</span>
          {duenos.map((a) => (
            <button key={a} type="button" onClick={() => onChange({ marca: a, marcaAuto: true })} className="h-7 cursor-pointer rounded-full border border-border px-2.5 font-semibold hover:bg-muted">
              {a}
            </button>
          ))}
        </p>
      )}
      {(sugArmadora || sugModelo) && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5" />
          “{sugArmadora ? c.marca : c.modelo}” no existe. ¿Quisiste decir{" "}
          <button
            type="button"
            className="cursor-pointer font-semibold underline"
            onClick={() => onChange(sugArmadora ? { marca: sugArmadora } : { modelo: sugModelo! })}
          >
            {sugArmadora ?? sugModelo}
          </button>
          ?
        </p>
      )}
      {sinAnios && (c.marca || c.modelo) && <p className="mt-1.5 text-xs text-red-700 dark:text-red-300">Sin años no aparece en las búsquedas por carro.</p>}
    </div>
  );
}

function Conversiones({
  p,
  puedeEditar,
  numeros,
  setNumeros,
  onCambio,
}: {
  p: PiezaDetalle;
  puedeEditar: boolean;
  numeros: string[];
  setNumeros: (n: string[]) => void;
  onCambio: () => void;
}) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<FilaCatalogo[]>([]);
  const [num, setNum] = useState("");

  useEffect(() => {
    if (q.trim().length < 2) {
      setRes([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = unwrap(await buscarCatalogo({ q }, 0));
        setRes(r.filas.filter((x) => x.sku !== p.sku).slice(0, 6));
      } catch {
        setRes([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, p.sku]);

  async function ligar(otro: string) {
    try {
      unwrap(await ligarConversion(p.sku, otro));
      toast.success("Ligadas: las dos se muestran como conversión");
      setQ("");
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo ligar");
    }
  }
  async function desligar(otro: string) {
    try {
      unwrap(await desligarConversion(p.sku, otro));
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo quitar");
    }
  }

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Equivalentes en tu inventario</h3>
        <p className="mt-1 text-xs text-muted-foreground">La misma pieza con otra clave. Si esta se agota, el POS y el agente ofrecen la equivalente.</p>
        <ul className="mt-2 divide-y divide-border/70 overflow-hidden rounded-xl border border-border">
          {p.conversiones.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">Sin conversiones.</li>}
          {p.conversiones.map((o) => (
            <li key={o.sku} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <span className="w-24 shrink-0 font-mono text-xs font-bold">{o.sku}</span>
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              <span className="font-mono text-xs">{o.price_cents ? formatMXN(o.price_cents) : "—"}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", o.quantity > 0 ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800")}>
                {o.quantity > 0 ? `${o.quantity} pzs` : "Agotada"}
              </span>
              {puedeEditar && (
                <button type="button" aria-label={`Quitar ${o.sku}`} onClick={() => desligar(o.sku)} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {puedeEditar && (
          <div className="mt-3">
            <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 focus-within:border-ring">
              <Search className="h-4 w-4 text-muted-foreground" />
              <span className="sr-only">Ligar conversión</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ligar otra clave: escribe clave o descripción" className="h-full w-0 min-w-0 flex-1 bg-transparent text-base outline-hidden lg:text-sm" />
            </label>
            {res.length > 0 && (
              <ul className="mt-1.5 divide-y divide-border/70 overflow-hidden rounded-xl border border-border shadow-sm">
                {res.map((x) => (
                  <li key={x.sku} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="w-24 shrink-0 font-mono text-xs font-bold">{x.sku}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{x.name}</span>
                      {x.carros.length > 0 && <span className="block truncate text-xs text-muted-foreground">{x.carros.join(" · ")}</span>}
                    </span>
                    <span className="font-mono text-xs">{x.price_cents ? formatMXN(x.price_cents) : "—"}</span>
                    <Button variant="secondary" size="sm" onClick={() => ligar(x.sku)}>Ligar</Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Números originales y de otras marcas</h3>
        <p className="mt-1 text-xs text-muted-foreground">Solo para buscar: si el cliente da este número, encuentra esta pieza. Se guardan con “Guardar”.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {numeros.map((n) => (
            <span key={n} className="inline-flex h-8 items-center gap-1 rounded-full bg-muted pl-3 pr-1 font-mono text-xs">
              {n}
              {puedeEditar && (
                <button type="button" aria-label={`Quitar ${n}`} onClick={() => setNumeros(numeros.filter((x) => x !== n))} className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full hover:bg-background">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          ))}
          {puedeEditar && (
            <input
              value={num}
              onChange={(e) => setNum(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter" && num.trim()) {
                  e.preventDefault();
                  if (!numeros.includes(num.trim())) setNumeros([...numeros, num.trim()]);
                  setNum("");
                }
              }}
              aria-label="Agregar número original"
              placeholder="+ Agregar número"
              className="h-8 w-44 rounded-full border border-dashed border-foreground/30 bg-background px-3 font-mono text-base outline-hidden focus:border-ring lg:text-xs"
            />
          )}
        </div>
      </section>
    </div>
  );
}
