"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ComboSelect, type Opcion } from "@/components/ui/combo-select";
import { cn } from "@/lib/utils";
import { unwrap } from "@/lib/errors";
import { formatMXN } from "@/lib/money";
import { buscarCatalogo, renombrarFamilia, type FilaCatalogo, type FiltrosCatalogo, type OpcionesCatalogo } from "./actions";
import { PiezaPanel } from "./PiezaPanel";
import { AplicarCarros } from "./AplicarCarros";
import { AsignarLote } from "./AsignarLote";
import { HerramientasCatalogo } from "./HerramientasCatalogo";
import { ImportarEquivalencias } from "./ImportarEquivalencias";

/**
 * "Catálogo": the owner's sheet, in the app. Filter Sistema → Refacción →
 * Marca, open a part to edit its cars, refacción and conversiones, or select
 * several and apply cars or a field to all of them at once.
 */
export function CatalogoView({
  opciones,
  puedeEditar,
  puedePrecios,
  autopartes,
}: {
  opciones: OpcionesCatalogo;
  puedeEditar: boolean;
  puedePrecios: boolean;
  autopartes: boolean;
}) {
  const [f, setF] = useState<FiltrosCatalogo>({});
  const [q, setQ] = useState("");
  const [filas, setFilas] = useState<FilaCatalogo[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [abierta, setAbierta] = useState<string | null>(null);
  const [lote, setLote] = useState<null | "carros" | "familia" | "sistema" | "brand">(null);

  const cargar = useCallback(
    async (filtros: FiltrosCatalogo, desde = 0) => {
      setCargando(true);
      try {
        const r = unwrap(await buscarCatalogo(filtros, desde));
        setFilas((prev) => (desde ? [...prev, ...r.filas] : r.filas));
        setTotal(r.total);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo buscar");
      } finally {
        setCargando(false);
      }
    },
    [],
  );

  // Typing waits a beat; the selects apply at once.
  useEffect(() => {
    const t = setTimeout(() => cargar({ ...f, q }), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [f, q, cargar]);

  const familiasVisibles = f.sistema ? opciones.familias.filter((x) => !x.sistema || x.sistema === f.sistema) : opciones.familias;
  const set = (p: Partial<FiltrosCatalogo>) => {
    setF((x) => ({ ...x, ...p }));
    setSel(new Set());
  };
  const alternar = (sku: string) => setSel((s) => {
    const n = new Set(s);
    if (n.has(sku)) n.delete(sku);
    else n.add(sku);
    return n;
  });
  const refrescar = () => cargar({ ...f, q });
  const hayFiltros = Boolean(q || f.sistema || f.familia || f.marca || f.vmarca || f.falta);
  // FiltroCarro keeps the typed year itself: remount it to clear that too.
  const [limpiezas, setLimpiezas] = useState(0);
  const limpiar = () => {
    setQ("");
    set({ sistema: null, familia: null, marca: null, vmarca: null, vmodelo: null, version: null, anio: null, falta: null });
    setLimpiezas((n) => n + 1);
  };

  const pend = opciones.pendientes;
  const chips: { falta: NonNullable<FiltrosCatalogo["falta"]>; label: string; n: number }[] = [
    ...(autopartes ? [{ falta: "carros" as const, label: "Sin carros", n: pend.sin_carros }] : []),
    { falta: "refaccion", label: "Sin refacción", n: pend.sin_refaccion },
    { falta: "sistema", label: "Sin sistema", n: pend.sin_sistema },
  ];

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 basis-72">
          <h1 className="text-2xl font-semibold tracking-tight">Catálogo</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {autopartes ? "Carros, refacción" : "Refacción"} y conversiones de cada pieza. Lo que cambies aquí lo usan el POS, la tienda y el agente.
          </p>
        </div>
        {(puedeEditar || puedePrecios) && (
          // One bar for the file tools: they read as a set, not five loose buttons.
          <div className="flex flex-wrap items-stretch divide-x divide-border overflow-hidden rounded-lg border border-border bg-background">
            {puedeEditar && <HerramientasCatalogo opciones={opciones} onListo={refrescar} />}
            {puedeEditar && autopartes && <ImportarEquivalencias onListo={refrescar} />}
            {puedePrecios && (
              <Link href="/catalogo/precios" className="inline-flex h-9 items-center whitespace-nowrap px-3 text-sm font-medium transition-colors hover:bg-muted">
                Importar precios del SAE
              </Link>
            )}
          </div>
        )}
      </div>

      <section aria-label="Filtros" className="space-y-3 rounded-xl border border-border bg-background p-3 sm:p-4">
        <div className="flex gap-2">
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 focus-within:border-ring focus-within:bg-background">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="sr-only">Buscar</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={autopartes ? "Buscar por clave, descripción o carro" : "Buscar por clave o descripción"}
              className="h-full w-0 min-w-0 flex-1 bg-transparent text-base outline-hidden lg:text-sm"
            />
          </label>
          {hayFiltros && (
            <Button type="button" variant="ghost" className="h-11 shrink-0" onClick={limpiar}>
              <X className="h-4 w-4" /> Limpiar
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <Grupo titulo="Pieza">
            <Filtro
              label="Sistema"
              valor={f.sistema ?? ""}
              onChange={(v) => set({ sistema: v || null, familia: null })}
              opciones={opciones.sistemas.map((s) => ({ value: s.id, label: s.nombre }))}
            />
            <Filtro
              label="Refacción"
              valor={f.familia ?? ""}
              onChange={(v) => set({ familia: v || null })}
              opciones={familiasVisibles.map((x) => ({ value: x.id, label: x.nombre }))}
            />
            <Filtro
              label="Marca"
              valor={f.marca ?? ""}
              onChange={(v) => set({ marca: v || null })}
              opciones={opciones.marcas.map((m) => ({ value: m, label: m }))}
            />
          </Grupo>
          {autopartes && (
            <Grupo titulo="Carro" className="lg:border-l lg:border-border lg:pl-4">
              <FiltroCarro key={limpiezas} f={f} set={set} opciones={opciones} />
            </Grupo>
          )}
        </div>

        {puedeEditar && f.familia && (
          <RenombrarFamilia
            key={f.familia}
            id={f.familia}
            nombre={opciones.familias.find((x) => x.id === f.familia)?.nombre ?? ""}
            onListo={refrescar}
          />
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Por completar:</span>
        {chips.map((c) => (
          <button
            key={c.falta}
            type="button"
            aria-pressed={f.falta === c.falta}
            onClick={() => set({ falta: f.falta === c.falta ? null : c.falta })}
            className={cn(
              "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs",
              f.falta === c.falta ? "border-brand bg-brand-soft font-semibold text-brand-foreground" : "border-border bg-background hover:bg-muted",
            )}
          >
            {c.label} <b className="font-semibold">{c.n.toLocaleString("es-MX")}</b>
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {cargando ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : `${total.toLocaleString("es-MX")} piezas`}
        </span>
      </div>

      {/* Desktop: the sheet as a table. */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-background lg:block">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-muted/50 text-left text-xs font-semibold text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2.5">
                {puedeEditar && (
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todas"
                    checked={filas.length > 0 && filas.every((x) => sel.has(x.sku))}
                    onChange={(e) => setSel(e.target.checked ? new Set(filas.map((x) => x.sku)) : new Set())}
                    className="h-4 w-4 accent-brand"
                  />
                )}
              </th>
              <th className="w-28 px-2">Clave</th>
              <th className="px-2">Descripción</th>
              <th className="w-36 px-2">Refacción</th>
              <th className="w-28 px-2">Marca</th>
              {autopartes && <th className="w-[26%] px-2">Carros</th>}
              <th className="w-14 px-2 text-center">Conv.</th>
              <th className="w-24 px-2 text-right">Precio</th>
              <th className="w-16 px-3 text-right">Exist.</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((x) => (
              <tr
                key={x.sku}
                onClick={() => setAbierta(x.sku)}
                className={cn("cursor-pointer border-t border-border/70 hover:bg-muted/40", sel.has(x.sku) && "bg-brand-soft/60")}
              >
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  {puedeEditar && <input type="checkbox" aria-label={x.sku} checked={sel.has(x.sku)} onChange={() => alternar(x.sku)} className="h-4 w-4 accent-brand" />}
                </td>
                <td className="px-2 font-mono text-xs font-semibold">{x.sku}</td>
                <td className="truncate px-2">{x.name}</td>
                <td className="truncate px-2">{x.familia_nombre ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="truncate px-2">{x.brand ?? <span className="text-muted-foreground">—</span>}</td>
                {autopartes && (
                  <td className="px-2">
                    <Carros carros={x.carros} />
                  </td>
                )}
                <td className="px-2 text-center">{x.n_conv || <span className="text-muted-foreground">—</span>}</td>
                <td className="px-2 text-right font-mono text-xs">{x.price_cents ? formatMXN(x.price_cents) : "—"}</td>
                <td className="px-3 text-right font-mono text-xs">{x.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone: cards. */}
      <ul className="space-y-2 lg:hidden">
        {filas.map((x) => (
          <li key={x.sku} className={cn("flex gap-3 rounded-xl border border-border bg-background p-3", sel.has(x.sku) && "border-brand bg-brand-soft/50")}>
            {puedeEditar && (
              <input type="checkbox" aria-label={x.sku} checked={sel.has(x.sku)} onChange={() => alternar(x.sku)} className="mt-1 h-5 w-5 shrink-0 accent-brand" />
            )}
            <button type="button" onClick={() => setAbierta(x.sku)} className="min-w-0 flex-1 cursor-pointer text-left">
              <span className="font-mono text-xs font-semibold text-brand-foreground">{x.sku}</span>
              <span className="text-xs text-muted-foreground">
                {" "}· {x.familia_nombre ?? "sin refacción"} · {x.price_cents ? formatMXN(x.price_cents) : "sin precio"}
              </span>
              <span className="mt-0.5 block text-sm font-semibold">{x.name}</span>
              {autopartes && <Carros carros={x.carros} />}
            </button>
          </li>
        ))}
      </ul>

      {!cargando && filas.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nada con esos filtros.</p>}
      {filas.length < total && (
        <div className="flex justify-center">
          <Button variant="secondary" loading={cargando} onClick={() => cargar({ ...f, q }, filas.length)}>
            Ver más
          </Button>
        </div>
      )}

      {sel.size > 0 && (
        <div className="fixed inset-x-3 bottom-3 z-40 flex flex-wrap items-center gap-2 rounded-2xl bg-foreground px-4 py-3 text-background shadow-2xl lg:left-auto lg:right-6 lg:max-w-3xl">
          <span className="mr-auto text-sm font-semibold">
            {sel.size} {sel.size === 1 ? "pieza seleccionada" : "piezas seleccionadas"}
          </span>
          {autopartes && (
            <Button variant="brand" size="sm" className="h-9" onClick={() => setLote("carros")}>
              Aplicar carros
            </Button>
          )}
          <Button variant="secondary" size="sm" className="h-9" onClick={() => setLote("familia")}>Poner refacción</Button>
          <Button variant="secondary" size="sm" className="h-9" onClick={() => setLote("sistema")}>Poner sistema</Button>
          <Button variant="secondary" size="sm" className="h-9" onClick={() => setLote("brand")}>Poner marca</Button>
          <button type="button" onClick={() => setSel(new Set())} className="h-9 cursor-pointer px-2 text-sm text-background/70 hover:text-background">
            Quitar selección
          </button>
        </div>
      )}

      <PiezaPanel
        sku={abierta}
        opciones={opciones}
        puedeEditar={puedeEditar}
        autopartes={autopartes}
        onClose={() => setAbierta(null)}
        onGuardado={refrescar}
      />
      {lote === "carros" && (
        <AplicarCarros skus={[...sel]} vehiculos={opciones.vehiculos} versiones={opciones.versiones} onClose={() => setLote(null)} onListo={() => { setLote(null); refrescar(); }} />
      )}
      {lote && lote !== "carros" && (
        <AsignarLote campo={lote} skus={[...sel]} opciones={opciones} onClose={() => setLote(null)} onListo={() => { setLote(null); refrescar(); }} />
      )}
    </div>
  );
}

/** Rename the selected refacción in place: the POS, the store and the parts
 *  all read the new name. */
function RenombrarFamilia({ id, nombre, onListo }: { id: string; nombre: string; onListo: () => void }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(nombre);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (valor.trim() === nombre) return setEditando(false);
    setGuardando(true);
    try {
      unwrap(await renombrarFamilia(id, valor));
      toast.success("Refacción renombrada");
      setEditando(false);
      router.refresh();
      onListo();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo renombrar");
    } finally {
      setGuardando(false);
    }
  };

  if (!editando)
    return (
      <Button type="button" variant="secondary" onClick={() => { setValor(nombre); setEditando(true); }}>
        <Pencil className="h-3.5 w-3.5" /> Renombrar
      </Button>
    );
  return (
    <form
      className="flex w-full items-end gap-2 sm:w-auto"
      onSubmit={(e) => {
        e.preventDefault();
        void guardar();
      }}
    >
      <label className="flex min-w-0 flex-1 flex-col gap-1 sm:w-72 sm:flex-none">
        <span className="text-xs font-semibold text-muted-foreground">Nuevo nombre de la refacción</span>
        <input
          autoFocus
          value={valor}
          maxLength={80}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setEditando(false)}
          className="h-10 rounded-lg border border-border bg-background px-3 text-base outline-hidden focus:border-ring lg:text-sm"
        />
      </label>
      <Button type="submit" loading={guardando} disabled={!valor.trim()}>
        Guardar
      </Button>
      <Button type="button" variant="ghost" onClick={() => setEditando(false)} disabled={guardando}>
        Cancelar
      </Button>
    </form>
  );
}

/** A labelled set of filters: "Pieza" (what it is) or "Carro" (what it fits). */
function Grupo({ titulo, className, children }: { titulo: string; className?: string; children: React.ReactNode }) {
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</legend>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">{children}</div>
    </fieldset>
  );
}

function Filtro({ label, valor, onChange, opciones }: { label: string; valor: string; onChange: (v: string) => void; opciones: Opcion[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:w-44">
      <span className="text-xs text-muted-foreground">{label}</span>
      <ComboSelect aria-label={label} valor={valor} onChange={onChange} vacio="Todas" opciones={opciones} />
    </div>
  );
}

/**
 * "Carro": review every part of one car and edit it in place — Armadora →
 * Modelo, then Versión (when the model has named ones) and Año, both optional.
 */
function FiltroCarro({
  f,
  set,
  opciones,
}: {
  f: FiltrosCatalogo;
  set: (p: Partial<FiltrosCatalogo>) => void;
  opciones: OpcionesCatalogo;
}) {
  const modelos = f.vmarca ? opciones.vehiculos[f.vmarca] ?? [] : [];
  const versiones = f.vmarca && f.vmodelo ? opciones.versiones[`${f.vmarca}|${f.vmodelo}`] ?? [] : [];
  const [anio, setAnio] = useState(f.anio ? String(f.anio) : "");
  const op = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));
  return (
    <>
      <div className="flex min-w-0 flex-col gap-1 sm:w-40">
        <span className="text-xs text-muted-foreground">Armadora</span>
        <ComboSelect
          aria-label="Armadora"
          valor={f.vmarca ?? ""}
          onChange={(v) => {
            setAnio("");
            set({ vmarca: v || null, vmodelo: null, version: null, anio: null });
          }}
          vacio="Todas"
          opciones={op(Object.keys(opciones.vehiculos).sort((a, b) => a.localeCompare(b, "es")))}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1 sm:w-40">
        <span className="text-xs text-muted-foreground">Modelo</span>
        <ComboSelect
          aria-label="Modelo"
          valor={f.vmodelo ?? ""}
          onChange={(v) => set({ vmodelo: v || null, version: null })}
          vacio="Todos"
          disabled={!f.vmarca}
          opciones={op(modelos)}
        />
      </div>
      {versiones.length > 0 && (
        <div className="flex min-w-0 flex-col gap-1 sm:w-36">
          <span className="text-xs text-muted-foreground">Versión</span>
          <ComboSelect
            aria-label="Versión"
            valor={f.version ?? ""}
            onChange={(v) => set({ version: v || null })}
            vacio="Todas"
            opciones={op(versiones)}
          />
        </div>
      )}
      <label className="flex min-w-0 flex-col gap-1 sm:w-24">
        <span className="text-xs text-muted-foreground">Año</span>
        <input
          value={anio}
          disabled={!f.vmarca}
          inputMode="numeric"
          maxLength={4}
          placeholder="Todos"
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 4);
            setAnio(v);
            // Filter once a whole year is typed; clearing drops the filter.
            if (v.length === 4 || v === "") set({ anio: v ? Number(v) : null });
          }}
          className="h-10 rounded-lg border border-border bg-background px-3 text-base outline-hidden focus:border-ring disabled:opacity-50 lg:text-sm"
        />
      </label>
    </>
  );
}

function Carros({ carros }: { carros: string[] }) {
  if (!carros.length) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      {carros.slice(0, 2).map((c) => (
        <span key={c} className="whitespace-nowrap rounded-md bg-sky-50 px-1.5 py-0.5 text-xs text-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          {c}
        </span>
      ))}
      {carros.length > 2 && <span className="text-xs font-semibold text-muted-foreground">+{carros.length - 2}</span>}
    </span>
  );
}
