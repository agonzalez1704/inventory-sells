"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { unwrap } from "@/lib/errors";
import { formatMXN } from "@/lib/money";
import { buscarCatalogo, type FilaCatalogo, type FiltrosCatalogo, type OpcionesCatalogo } from "./actions";
import { PiezaPanel } from "./PiezaPanel";
import { AplicarCarros } from "./AplicarCarros";
import { AsignarLote } from "./AsignarLote";

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

  const pend = opciones.pendientes;
  const chips: { falta: NonNullable<FiltrosCatalogo["falta"]>; label: string; n: number }[] = [
    ...(autopartes ? [{ falta: "carros" as const, label: "Sin carros", n: pend.sin_carros }] : []),
    { falta: "refaccion", label: "Sin refacción", n: pend.sin_refaccion },
    { falta: "sistema", label: "Sin sistema", n: pend.sin_sistema },
  ];

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-72">
          <h1 className="text-2xl font-semibold tracking-tight">Catálogo</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {autopartes ? "Carros, refacción" : "Refacción"} y conversiones de cada pieza. Lo que cambies aquí lo usan el POS, la tienda y el agente.
          </p>
        </div>
        {puedePrecios && (
          <Link href="/catalogo/precios" className="inline-flex h-10 items-center rounded-lg border border-border bg-background px-4 text-sm font-medium hover:bg-muted">
            Importar precios del SAE
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2.5">
        <Filtro label="Sistema" valor={f.sistema ?? ""} onChange={(v) => set({ sistema: v || null, familia: null })}>
          {opciones.sistemas.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </Filtro>
        <Filtro label="Refacción" valor={f.familia ?? ""} onChange={(v) => set({ familia: v || null })}>
          {familiasVisibles.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </Filtro>
        <Filtro label="Marca" valor={f.marca ?? ""} onChange={(v) => set({ marca: v || null })}>
          {opciones.marcas.map((m) => <option key={m} value={m}>{m}</option>)}
        </Filtro>
        <label className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
          <span className="text-xs font-semibold text-muted-foreground">Buscar</span>
          <span className="flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 focus-within:border-ring">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={autopartes ? "Clave, descripción o carro" : "Clave o descripción"}
              className="h-full w-0 min-w-0 flex-1 bg-transparent text-base outline-hidden lg:text-sm"
            />
          </span>
        </label>
      </div>

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
        <AplicarCarros skus={[...sel]} vehiculos={opciones.vehiculos} onClose={() => setLote(null)} onListo={() => { setLote(null); refrescar(); }} />
      )}
      {lote && lote !== "carros" && (
        <AsignarLote campo={lote} skus={[...sel]} opciones={opciones} onClose={() => setLote(null)} onListo={() => { setLote(null); refrescar(); }} />
      )}
    </div>
  );
}

function Filtro({ label, valor, onChange, children }: { label: string; valor: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="flex w-[calc(50%-0.4rem)] flex-col gap-1 sm:w-48">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <Select value={valor} onChange={(e) => onChange(e.target.value)} className={cn(valor && "border-brand")}>
        <option value="">Todas</option>
        {children}
      </Select>
    </label>
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
