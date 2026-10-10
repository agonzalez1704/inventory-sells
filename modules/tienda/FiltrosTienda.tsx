"use client";

import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useEffect, useState } from "react";
import { Check, Loader2, SlidersHorizontal, X } from "lucide-react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { CALIDADES } from "@/lib/calidad";
import {
  alternar,
  cuantosFiltros,
  LISTAS,
  SIN_FILTROS,
  type Facet,
  type Facetas,
  type Filtros,
} from "./filtros";

type Cambio = (f: Filtros) => void;

// Long lists (Ruli has 216 part types) show this many, the rest behind "Ver todas".
const TOPE = 8;

// Chosen first, so turning something on never scrolls it out of reach; then
// the most useful.
function ordenar(opciones: Facet[], activos: string[]) {
  return [...opciones].sort(
    (a, b) =>
      Number(activos.includes(b.value)) - Number(activos.includes(a.value)) ||
      b.n - a.n ||
      a.value.localeCompare(b.value),
  );
}

// A section where every option would give zero and nothing is on can only
// frustrate: hide it.
const util = (opciones: Facet[], activos: string[]) =>
  activos.length > 0 || opciones.some((o) => o.n > 0);

/**
 * The filter panel, identical in the desktop rail and the phone sheet. Every
 * number is contextual: what the customer gets by adding that option to what is
 * already on (tienda_facetas_ctx). Zero options stay visible but dimmed, so a
 * short list explains itself.
 */
export function PanelFiltros({
  facetas,
  filtros,
  onCambio,
  vehiculoArriba = false,
}: {
  facetas: Facetas;
  filtros: Filtros;
  onCambio: Cambio;
  /** Desktop: the vehicle lives in BarraVehiculo above the catalog, not here. */
  vehiculoArriba?: boolean;
}) {
  const set = (parcial: Partial<Filtros>) => onCambio({ ...filtros, ...parcial });
  // Price ladder order (cheapest tier first), not popularity: it is a scale.
  const calidades = [...facetas.cal].sort(
    (a, b) =>
      CALIDADES.indexOf(b.value as (typeof CALIDADES)[number]) -
      CALIDADES.indexOf(a.value as (typeof CALIDADES)[number]),
  );
  const conMarco = facetas.marco.find((o) => o.value === "Con marco");

  return (
    <div className="space-y-5">
      {facetas.vmarca.length > 0 && !vehiculoArriba && (
        <Seccion titulo="Tu vehículo">
          <div className="grid gap-2">
            <Selector
              label="Marca"
              valor={filtros.vmarca}
              opciones={facetas.vmarca}
              onElegir={(v) => set({ vmarca: v, vmodelo: null, anio: null, version: null })}
            />
            <Selector
              label="Modelo"
              valor={filtros.vmodelo}
              opciones={facetas.vmodelo}
              deshabilitado={!filtros.vmarca}
              onElegir={(v) => set({ vmodelo: v, anio: null, version: null })}
            />
            <Selector
              label="Año"
              valor={filtros.anio ? String(filtros.anio) : null}
              opciones={facetas.anio}
              deshabilitado={!filtros.vmodelo}
              numerico
              onElegir={(v) => set({ anio: v ? Number(v) : null, version: null })}
            />
            {conVersiones(facetas, filtros) && (
              <Selector
                label="Versión"
                valor={filtros.version}
                opciones={facetas.version}
                onElegir={(v) => set({ version: v })}
              />
            )}
          </div>
        </Seccion>
      )}

      {util(facetas.sis, filtros.sis) && (
        <Seccion titulo="Sistema">
          <ListaCheck
            opciones={facetas.sis}
            activos={filtros.sis}
            onAlternar={(v) => set({ sis: alternar(filtros.sis, v) })}
          />
        </Seccion>
      )}

      {util(facetas.cat, filtros.cat) && (
        <Seccion titulo="Tipo de pieza">
          <ListaCheck
            opciones={facetas.cat}
            activos={filtros.cat}
            onAlternar={(v) => set({ cat: alternar(filtros.cat, v) })}
          />
        </Seccion>
      )}

      {util(facetas.marca, filtros.marca) && (
        // With a vehicle filter above, "Marca" alone would read as the car's.
        <Seccion titulo={facetas.vmarca.length > 0 ? "Marca de refacción" : "Marca"}>
          <ListaCheck
            opciones={facetas.marca}
            activos={filtros.marca}
            onAlternar={(v) => set({ marca: alternar(filtros.marca, v) })}
          />
        </Seccion>
      )}

      {util(facetas.cal, filtros.cal) && (
        <Seccion titulo="Calidad" nota="Puedes elegir varias">
          <Pildoras
            opciones={calidades}
            activos={filtros.cal}
            onAlternar={(v) => set({ cal: alternar(filtros.cal, v) })}
          />
        </Seccion>
      )}

      {util(facetas.tag, filtros.tag) && (
        <Seccion titulo="Etiquetas" nota="Puedes elegir varias">
          <Pildoras
            opciones={ordenar(facetas.tag, filtros.tag)}
            activos={filtros.tag}
            onAlternar={(v) => set({ tag: alternar(filtros.tag, v) })}
          />
        </Seccion>
      )}

      <Seccion titulo="Más">
        <Interruptor
          label="Solo con existencia"
          activo={filtros.stock}
          onCambio={(v) => set({ stock: v })}
        />
        {(conMarco?.n || filtros.marco.includes("Con marco")) && (
          <Interruptor
            label="Con marco"
            detalle="La pantalla ya viene montada en su marco"
            activo={filtros.marco.includes("Con marco")}
            onCambio={(v) => set({ marco: v ? ["Con marco"] : [] })}
          />
        )}
      </Seccion>
    </div>
  );
}

/**
 * Desktop, per the approved Ruli design: the vehicle is the first question at
 * an auto-parts counter, so it sits in a bar above the catalog — make, model,
 * year — and says plainly that the list now only shows parts that fit.
 * Renders nothing where no vehicle tags exist (Lead Displays).
 */
export function BarraVehiculo({
  facetas,
  filtros,
  onCambio,
}: {
  facetas: Facetas;
  filtros: Filtros;
  onCambio: Cambio;
}) {
  if (facetas.vmarca.length === 0) return null;
  const set = (parcial: Partial<Filtros>) => onCambio({ ...filtros, ...parcial });

  return (
    <div className="mt-6 hidden flex-wrap items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 lg:flex">
      <span className="text-sm font-semibold text-foreground">Tu vehículo</span>
      <div className="w-56">
        <Selector
          label="Marca"
          valor={filtros.vmarca}
          opciones={facetas.vmarca}
          onElegir={(v) => set({ vmarca: v, vmodelo: null, anio: null, version: null })}
        />
      </div>
      <div className="w-56">
        <Selector
          label="Modelo"
          valor={filtros.vmodelo}
          opciones={facetas.vmodelo}
          deshabilitado={!filtros.vmarca}
          onElegir={(v) => set({ vmodelo: v, anio: null, version: null })}
        />
      </div>
      <div className="w-52">
        <Selector
          label="Año"
          valor={filtros.anio ? String(filtros.anio) : null}
          opciones={facetas.anio}
          deshabilitado={!filtros.vmodelo}
          numerico
          onElegir={(v) => set({ anio: v ? Number(v) : null, version: null })}
        />
      </div>
      {conVersiones(facetas, filtros) && (
        <div className="w-52">
          <Selector
            label="Versión"
            valor={filtros.version}
            opciones={facetas.version}
            onElegir={(v) => set({ version: v })}
          />
        </div>
      )}
      {filtros.vmarca && (
        <>
          <span className="text-sm text-muted-foreground">Solo te mostramos piezas que le quedan</span>
          <button
            type="button"
            onClick={() => set({ vmarca: null, vmodelo: null, anio: null, version: null })}
            className="ml-auto h-11 cursor-pointer text-sm font-medium text-tienda-700 hover:underline"
          >
            Quitar vehículo
          </button>
        </>
      )}
    </div>
  );
}

function Seccion({
  titulo,
  nota,
  children,
}: {
  titulo: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
        {nota && <span className="text-xs text-muted-foreground">{nota}</span>}
      </div>
      {children}
    </section>
  );
}

function ListaCheck({
  opciones,
  activos,
  onAlternar,
}: {
  opciones: Facet[];
  activos: string[];
  onAlternar: (v: string) => void;
}) {
  const [todas, setTodas] = useState(false);
  const orden = ordenar(opciones, activos);
  const visibles = todas ? orden : orden.slice(0, Math.max(TOPE, activos.length));

  return (
    <div>
      {visibles.map((o) => {
        const activo = activos.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            role="checkbox"
            aria-checked={activo}
            disabled={o.n === 0 && !activo}
            onClick={() => onAlternar(o.value)}
            className="flex h-11 w-full cursor-pointer items-center gap-3 text-left text-sm disabled:cursor-default disabled:opacity-40"
          >
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                activo ? "border-tienda-600 bg-tienda-600 text-white" : "border-muted-foreground/40 bg-background",
              )}
            >
              {activo && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            </span>
            <span className="min-w-0 flex-1 truncate">{o.value}</span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">{o.n}</span>
          </button>
        );
      })}
      {orden.length > visibles.length && (
        <button
          type="button"
          onClick={() => setTodas(true)}
          className="h-11 cursor-pointer text-sm font-medium text-tienda-700 hover:underline"
        >
          Ver todas ({orden.length})
        </button>
      )}
    </div>
  );
}

function Pildoras({
  opciones,
  activos,
  onAlternar,
}: {
  opciones: Facet[];
  activos: string[];
  onAlternar: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {opciones.map((o) => {
        const activo = activos.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            role="checkbox"
            aria-checked={activo}
            disabled={o.n === 0 && !activo}
            onClick={() => onAlternar(o.value)}
            className={cn(
              "inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm transition-colors disabled:cursor-default disabled:opacity-40",
              activo
                ? "border-tienda-600 bg-tienda-50 font-medium text-tienda-800"
                : "border-border bg-background hover:border-tienda-200",
            )}
          >
            {activo && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            {o.value}
            <span className="font-mono text-xs tabular-nums opacity-60">{o.n}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The version only asks when it decides something: a model with two or more
 * versions in the chosen year ("Versa 2021": V-Drive or 2ª generación). Once
 * chosen it stays visible so it can be changed back.
 */
const conVersiones = (facetas: Facetas, filtros: Filtros) =>
  !!filtros.vmodelo && (facetas.version.length > 1 || !!filtros.version);

const sinAcentos = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/**
 * shadcn's combobox: type "nis" and Nissan is there.
 *
 * It replaced a native select, which on a phone means scrolling a wheel of 75
 * makes to reach the one you could have typed in three letters. The list still
 * opens on tap for whoever prefers to browse, matches ignore accents and case,
 * and each option keeps its count of pieces.
 */
function Selector({
  label,
  valor,
  opciones,
  deshabilitado = false,
  numerico = false,
  onElegir,
}: {
  label: string;
  valor: string | null;
  opciones: Facet[];
  deshabilitado?: boolean;
  numerico?: boolean;
  onElegir: (v: string | null) => void;
}) {
  const lista = [...opciones].sort((a, b) =>
    numerico ? Number(b.value) - Number(a.value) : a.value.localeCompare(b.value),
  );
  // A chosen value must stay selectable even if it no longer has matches.
  if (valor && !lista.some((o) => o.value === valor)) lista.unshift({ value: valor, n: 0 });
  const cuantos = new Map(lista.map((o) => [o.value, o.n]));
  const valores = lista.map((o) => o.value);
  // The filter lives in the URL, and the navigation takes a moment: the pick
  // shows at once instead of the field blanking until the page answers.
  const [elegido, setElegido] = useState(valor);
  useEffect(() => setElegido(valor), [valor]);

  return (
    <Combobox
      items={valores}
      value={elegido}
      onValueChange={(v) => {
        const nuevo = (v as string | null) ?? null;
        setElegido(nuevo);
        onElegir(nuevo);
      }}
      disabled={deshabilitado}
      filter={(item: string, q: string) => sinAcentos(item).includes(sinAcentos(q.trim()))}
      autoHighlight
    >
      <ComboboxInput
        placeholder={deshabilitado ? "—" : "Cualquiera"}
        inputMode={numerico ? "numeric" : "text"}
        aria-label={label}
        disabled={deshabilitado}
        showClear={!!elegido && !deshabilitado}
        inputClassName="font-medium placeholder:font-normal"
        className="focus-within:border-tienda-500"
      >
        <span className="w-14 shrink-0 text-xs text-muted-foreground">{label}</span>
      </ComboboxInput>
      <ComboboxContent>
        <ComboboxEmpty>Ninguna coincide</ComboboxEmpty>
        <ComboboxList>
          {(v: string) => (
            <ComboboxItem key={v} value={v}>
              <span className="min-w-0 flex-1 truncate">{v}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{cuantos.get(v) ?? 0}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function Interruptor({
  label,
  detalle,
  activo,
  onCambio,
}: {
  label: string;
  detalle?: string;
  activo: boolean;
  onCambio: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={() => onCambio(!activo)}
      className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 text-left"
    >
      <span className="flex flex-col">
        <span className="text-sm">{label}</span>
        {detalle && <span className="text-xs text-muted-foreground">{detalle}</span>}
      </span>
      <span
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors",
          activo ? "bg-tienda-600" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-all",
            activo ? "left-5.5" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

/** Phone: the panel as a bottom sheet. Each tap applies at once, so the button
 *  count is always the real one; the button just closes. */
export function HojaFiltros({
  abierta,
  onCerrar,
  onLimpiar,
  pie,
  pending,
  children,
}: {
  abierta: boolean;
  onCerrar: () => void;
  onLimpiar: () => void;
  pie: string;
  pending: boolean;
  children: React.ReactNode;
}) {
  return (
    <Drawer open={abierta} onOpenChange={(o) => !o && onCerrar()} showSwipeHandle>
      <DrawerContent className="lg:hidden data-[swipe-direction=down]:top-16 data-[swipe-direction=down]:max-h-none">
        <div className="flex items-center justify-between px-4 pt-1">
          <DrawerTitle className="text-lg font-semibold tracking-tight">Filtros</DrawerTitle>
          <button
            type="button"
            onClick={onLimpiar}
            className="h-11 cursor-pointer text-sm font-medium text-tienda-700"
          >
            Limpiar todo
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
        <div className="border-t border-border px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onCerrar}
            className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-tienda-600 text-base font-semibold text-white"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {pie}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** Every active filter as a label plus the filters without it. */
function chipsActivos(filtros: Filtros): { label: string; sin: Filtros }[] {
  const chips: { label: string; sin: Filtros }[] = [];
  for (const k of LISTAS) {
    for (const v of filtros[k]) {
      chips.push({ label: v, sin: { ...filtros, [k]: filtros[k].filter((x) => x !== v) } });
    }
  }
  if (filtros.vmarca) {
    chips.push({
      label: [filtros.vmarca, filtros.vmodelo, filtros.version, filtros.anio].filter(Boolean).join(" "),
      sin: { ...filtros, vmarca: null, vmodelo: null, anio: null, version: null },
    });
  }
  if (filtros.stock) chips.push({ label: "Con existencia", sin: { ...filtros, stock: false } });
  return chips;
}

/**
 * Phone: one scrollable row under the search — the button to the full sheet,
 * what is on (tap to remove), then a few one-tap narrowings taken from the
 * counts. A suggestion only appears if it actually narrows the list: an option
 * covering every result would change nothing.
 */
export function BarraFiltros({
  facetas,
  filtros,
  onCambio,
  onAbrir,
}: {
  facetas: Facetas;
  filtros: Filtros;
  onCambio: Cambio;
  onAbrir: () => void;
}) {
  const activos = cuantosFiltros(filtros);
  const chips = chipsActivos(filtros);
  const sugerencias = (["cat", "marca", "cal"] as const).flatMap((k) =>
    facetas[k]
      .filter((o) => o.n > 0 && o.n < facetas.total && !filtros[k].includes(o.value))
      .sort((a, b) => b.n - a.n)
      .slice(0, k === "cat" ? 1 : 2)
      .map((o) => ({ k, o })),
  );

  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 scrollbar-none sm:-mx-6 sm:px-6 lg:hidden [&::-webkit-scrollbar]:hidden">
      <button
        type="button"
        onClick={onAbrir}
        aria-haspopup="dialog"
        className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-foreground px-4 text-sm font-medium text-background"
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filtros
        {activos > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-tienda-600 px-1.5 text-xs text-white">
            {activos}
          </span>
        )}
      </button>
      {chips.map((c, i) => (
        <button
          key={`${i}-${c.label}`}
          type="button"
          onClick={() => onCambio(c.sin)}
          aria-label={`Quitar ${c.label}`}
          className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-tienda-200 bg-tienda-50 pl-4 pr-3 text-sm font-medium text-tienda-800"
        >
          {c.label}
          <X className="h-4 w-4" aria-hidden />
        </button>
      ))}
      {sugerencias.map(({ k, o }) => (
        <button
          key={`${k}-${o.value}`}
          type="button"
          onClick={() => onCambio({ ...filtros, [k]: alternar(filtros[k], o.value) })}
          className="inline-flex h-11 shrink-0 cursor-pointer items-center rounded-full border border-border bg-background px-4 text-sm"
        >
          {o.value}
        </button>
      ))}
    </div>
  );
}

/** Desktop: what is on, each removable on its own. */
export function ChipsActivos({ filtros, onCambio }: { filtros: Filtros; onCambio: Cambio }) {
  const chips = chipsActivos(filtros);
  if (chips.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {chips.map((c, i) => (
        <button
          key={`${i}-${c.label}`}
          type="button"
          onClick={() => onCambio(c.sin)}
          aria-label={`Quitar ${c.label}`}
          className="inline-flex h-11 max-w-full cursor-pointer items-center gap-1.5 rounded-full bg-tienda-50 pl-3.5 pr-2.5 text-sm font-medium text-tienda-800 hover:bg-tienda-100"
        >
          <span className="truncate">{c.label}</span>
          <X className="h-4 w-4 shrink-0" aria-hidden />
        </button>
      ))}
      <button
        type="button"
        onClick={() => onCambio(SIN_FILTROS)}
        className="h-11 cursor-pointer px-1 text-sm font-medium text-tienda-700 hover:underline"
      >
        Limpiar todo
      </button>
    </div>
  );
}
