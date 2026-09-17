"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Check,
  ChevronLeft,
  ChevronRight,
  Landmark,
  MapPin,
  NotebookText,
  ShoppingCart,
  Undo2,
} from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ConteoCaja, Cuadre, EventoCaja } from "./cuadre";
import { ContarEfectivo } from "./ContarEfectivo";
import { reabrirDia } from "./cuadre-actions";

const TZ = "America/Mexico_City";
const hora = (iso: string) => new Intl.DateTimeFormat("es-MX", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const diaLargo = (f: string) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${f}T12:00:00Z`));
const diaChip = (f: string) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", weekday: "short", day: "numeric" }).format(new Date(`${f}T12:00:00Z`));
const signo = (c: number) => `${c < 0 ? "−" : "+"}${formatMXN(Math.abs(c))}`;
const efectivo = (e: EventoCaja) => e.metodo === "efectivo";

const TITULO: Record<EventoCaja["tipo"], string> = {
  venta: "Venta",
  cobro_fiado: "Cobro de fiado",
  adelanto: "Abono de adelanto",
  devolucion_adelanto: "Devolución de adelanto",
  ingreso: "Ingreso extra",
  gasto: "Gasto",
  devolucion: "Devolución",
};
const ICONO = { venta: ShoppingCart, cobro_fiado: NotebookText, adelanto: NotebookText, ingreso: ArrowUpRight, gasto: ArrowDownRight, devolucion: Undo2, devolucion_adelanto: Undo2 };

type Fila = { k: "ev"; e: EventoCaja; saldo: number | null } | { k: "conteo"; c: ConteoCaja };

export function CuadreView({ cuadre, hoy, admin }: { cuadre: Cuadre; hoy: string; admin: boolean }) {
  const router = useRouter();
  const [vista, setVista] = useState<"efectivo" | "todo">("efectivo");
  const [contar, setContar] = useState<"conteo" | "cierre" | null>(null);
  const [pending, start] = useTransition();
  const c = cuadre;
  // Phones scroll the week sideways: start at the selected day (the right end).
  const semanaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = semanaRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [c.fecha]);
  const cierre = c.conteos.find((x) => x.tipo === "cierre") ?? null;
  const ultimo = c.conteos.at(-1) ?? null;
  const sucNombre = c.sucursales.find((s) => s.id === c.sucursalId)?.nombre ?? null;
  const href = (p: { dia?: string; sucursal?: string | null }) => {
    const sp = new URLSearchParams();
    sp.set("dia", p.dia ?? c.fecha);
    const s = p.sucursal === undefined ? c.sucursalId : p.sucursal;
    if (s) sp.set("sucursal", s);
    return `/caja/cuadre?${sp}`;
  };

  // Events and counts on one line of time, with the running expected cash.
  const filas = useMemo<Fila[]>(() => {
    let saldo = c.fondoCents ?? 0;
    const out: Fila[] = [];
    const conteos = [...c.conteos];
    for (const e of c.eventos) {
      while (conteos.length && Date.parse(conteos[0].createdAt) < Date.parse(e.fecha)) out.push({ k: "conteo", c: conteos.shift()! });
      if (efectivo(e)) {
        saldo += e.montoCents;
        out.push({ k: "ev", e, saldo });
      } else if (vista === "todo") out.push({ k: "ev", e, saldo: null });
    }
    for (const x of conteos) out.push({ k: "conteo", c: x });
    return out;
  }, [c, vista]);
  const noEfectivo = c.eventos.filter((e) => !efectivo(e));

  // Where the gap first shows: the first count that didn't match.
  const primerDescuadre = c.conteos.find((x) => x.contadoCents !== x.esperadoAhoraCents) ?? null;

  const siguiente = c.fecha < hoy;
  const anterior = true;
  const diaMas = (n: number) => {
    const d = new Date(`${c.fecha}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  function reabrir() {
    if (!cierre) return;
    start(async () => {
      const r = await reabrirDia(cierre.id);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success("Día reabierto");
        router.refresh();
      }
    });
  }

  return (
    <section className="space-y-5" data-ancho="completo">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Caja</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <span className="first-letter:uppercase">{diaLargo(c.fecha)}</span>
            {sucNombre && (
              <>
                · <MapPin className="h-3.5 w-3.5 text-amber-600" /> {sucNombre}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {cierre ? (
            <>
              <span className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-muted px-3 text-sm font-medium">
                <Check className="h-4 w-4 text-emerald-600" /> Día cerrado
              </span>
              {admin && (
                <Button variant="ghost" onClick={reabrir} loading={pending}>
                  Reabrir
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setContar("conteo")}>
                <Banknote className="h-4 w-4" />
                <span className="hidden sm:inline">Contar ahora</span>
                <span className="sm:hidden">Contar</span>
              </Button>
              <Button onClick={() => setContar("cierre")}>
                <Check className="h-4 w-4" />
                Cerrar el día
              </Button>
            </>
          )}
        </div>
      </div>

      <nav className="flex gap-6 border-b border-border text-sm font-semibold">
        <Link href="/caja" className="py-2.5 text-muted-foreground hover:text-foreground">
          Corte del periodo
        </Link>
        <span className="py-2.5 shadow-[inset_0_-2px_0_hsl(var(--foreground))]">Cuadre del día</span>
      </nav>

      {c.sucursales.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
          {c.sucursales.map((s) => (
            <Link
              key={s.id}
              href={href({ sucursal: s.id })}
              className={cn(
                "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm",
                s.id === c.sucursalId ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
              )}
            >
              <MapPin className="h-3.5 w-3.5" /> {s.nombre}
            </Link>
          ))}
        </div>
      )}

      {/* The week: where a difference lives, at a glance. */}
      <div className="flex items-stretch gap-2">
        <Link href={href({ dia: diaMas(-7) })} aria-label="Semana anterior" className={cn("hidden w-9 shrink-0 items-center justify-center rounded-xl border border-border hover:bg-muted sm:flex", !anterior && "invisible")}>
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div ref={semanaRef} className="-mx-4 flex min-w-0 flex-1 gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-7 sm:px-0">
          {c.semana.map((d) => {
            const on = d.fecha === c.fecha;
            const vacio = d.estado === "sin_movimientos";
            return (
              <Link
                key={d.fecha}
                href={href({ dia: d.fecha })}
                className={cn(
                  "flex min-w-[6.5rem] shrink-0 flex-col gap-1.5 rounded-xl border bg-background px-3 py-2.5 hover:bg-muted/50",
                  on ? "border-foreground ring-1 ring-foreground" : "border-border",
                  vacio && !on && "opacity-55",
                )}
              >
                <span className="text-sm font-semibold capitalize">{d.fecha === hoy ? "Hoy" : diaChip(d.fecha)}</span>
                {d.estado === "cuadro" && <Estado tono="ok">Cuadró</Estado>}
                {d.estado === "diferencia" && (
                  <Estado tono="mal">{d.diferenciaCents < 0 ? `Faltan ${formatMXN(-d.diferenciaCents)}` : `Sobran ${formatMXN(d.diferenciaCents)}`}</Estado>
                )}
                {d.estado === "sin_cerrar" && <Estado tono="gris">{d.fecha === hoy ? "Abierto" : "Sin cerrar"}</Estado>}
                {vacio && <span className="text-xs text-muted-foreground">Sin movimientos</span>}
              </Link>
            );
          })}
        </div>
        <Link href={href({ dia: diaMas(7) > hoy ? hoy : diaMas(7) })} aria-label="Semana siguiente" className={cn("hidden w-9 shrink-0 items-center justify-center rounded-xl border border-border hover:bg-muted sm:flex", !siguiente && "invisible")}>
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {/* The numbers of the day */}
      <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-border bg-background sm:grid-cols-3 lg:grid-cols-6">
        <Cifra label="Fondo al abrir" valor={c.fondoCents == null ? "—" : formatMXN(c.fondoCents)} sub={c.fondoCents == null ? "Sin cierre anterior" : "Lo que se dejó ayer"} />
        <Cifra label="Entró en efectivo" valor={`+${formatMXN(c.entradasCents)}`} tono="ok" />
        <Cifra label="Salió en efectivo" valor={`−${formatMXN(c.salidasCents)}`} tono="mal" />
        <Cifra label="Debería haber" valor={formatMXN(c.esperadoCents)} fuerte />
        <Cifra label="Contaron" valor={ultimo ? formatMXN(ultimo.contadoCents) : "—"} sub={ultimo ? `${ultimo.quien} · ${hora(ultimo.createdAt)}` : "Sin contar"} />
        {c.diferenciaCents == null ? (
          <Cifra label="Diferencia" valor="—" sub="Cuenta el cajón para saber" />
        ) : (
          <div
            className={cn(
              "flex flex-col gap-0.5 border-t border-border px-4 py-3.5 lg:border-l lg:border-t-0",
              c.diferenciaCents === 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30",
            )}
          >
            <span className={cn("text-xs font-semibold", c.diferenciaCents === 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300")}>
              Diferencia
            </span>
            <span className={cn("text-2xl font-bold tabular-nums", c.diferenciaCents === 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300")}>
              {c.diferenciaCents === 0 ? "Cuadra" : signo(c.diferenciaCents)}
            </span>
            <span className={cn("text-xs", c.diferenciaCents === 0 ? "text-emerald-700/80 dark:text-emerald-300/80" : "text-red-700/80 dark:text-red-300/80")}>
              {c.diferenciaCents < 0 ? "Faltante" : c.diferenciaCents > 0 ? "Sobrante" : ultimo && ultimo.esperadoCents !== ultimo.esperadoAhoraCents ? "Tras corregir movimientos" : "Todo en orden"}
            </span>
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* Timeline */}
        <div className="order-2 overflow-hidden rounded-2xl border border-border bg-background lg:order-1">
          <div className="flex items-center gap-3 px-4 pb-3 pt-4 sm:px-5">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">Efectivo del día</p>
              <p className="text-xs text-muted-foreground">Cada entrada y salida del cajón, con lo que debería haber después</p>
            </div>
            <div className="inline-flex rounded-lg bg-muted p-0.5 text-sm">
              {(["efectivo", "todo"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVista(v)}
                  className={cn("h-8 cursor-pointer rounded-md px-3 font-medium", vista === v ? "bg-background shadow-sm" : "text-muted-foreground")}
                >
                  {v === "efectivo" ? "Efectivo" : "Todo"}
                </button>
              ))}
            </div>
          </div>
          <ul>
            <li className="flex h-11 items-center gap-3 border-t border-border/70 bg-muted/40 px-4 text-sm sm:px-5">
              <span className="hidden w-20 text-xs text-muted-foreground sm:block">Abre</span>
              <span className="flex-1 font-semibold">Fondo de caja</span>
              <span className="tabular-nums text-muted-foreground">{c.fondoCents == null ? "Sin registrar" : formatMXN(c.fondoCents)}</span>
            </li>
            {filas.length === 0 && (
              <li className="border-t border-border/70 px-5 py-10 text-center text-sm text-muted-foreground">Sin movimientos en efectivo este día.</li>
            )}
            {filas.map((f) =>
              f.k === "conteo" ? (
                <FilaConteo key={f.c.id} c={f.c} primero={primerDescuadre?.id === f.c.id} />
              ) : (
                <FilaEvento key={f.e.id} e={f.e} saldo={f.saldo} />
              ),
            )}
          </ul>
          {vista === "efectivo" && noEfectivo.length > 0 && (
            <button
              type="button"
              onClick={() => setVista("todo")}
              className="flex h-11 w-full cursor-pointer items-center gap-2 border-t border-border/70 bg-muted/40 px-4 text-left text-xs text-muted-foreground hover:text-foreground sm:px-5"
            >
              <Landmark className="h-3.5 w-3.5" />
              {noEfectivo.length} {noEfectivo.length === 1 ? "movimiento" : "movimientos"} sin efectivo ({formatMXN(noEfectivo.reduce((s, e) => s + Math.abs(e.montoCents), 0))}) no pasan por el cajón · ver
            </button>
          )}
        </div>

        {/* What to check first + per person */}
        <div className="order-1 space-y-3 lg:order-2">
          <div className="px-0.5">
            <p className="text-[15px] font-semibold">Revisa primero</p>
            <p className="text-xs text-muted-foreground">
              {c.diferenciaCents
                ? `Lo que más probablemente explica ${c.diferenciaCents < 0 ? "el faltante" : "el sobrante"} de ${formatMXN(Math.abs(c.diferenciaCents))}`
                : "Movimientos que suelen descuadrar la caja"}
            </p>
          </div>
          {c.sospechosos.length === 0 ? (
            <div className="rounded-2xl border border-border bg-background px-4 py-6 text-center text-sm text-muted-foreground">
              Nada fuera de lo normal este día.
            </div>
          ) : (
            c.sospechosos.map((s, i) => (
              <div
                key={s.clave}
                className={cn(
                  "space-y-1.5 rounded-2xl border p-3.5",
                  s.coincide ? "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30" : "border-border bg-background",
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      s.coincide ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-semibold">{s.titulo}</span>
                  <span className="text-sm font-semibold tabular-nums">{formatMXN(Math.abs(s.montoCents))}</span>
                </div>
                {s.coincide && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                    <Check className="h-3 w-3" /> Coincide con la diferencia
                  </span>
                )}
                <p className="text-sm">{s.detalle}</p>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-xs text-muted-foreground">{s.meta}</span>
                  {s.saleId && (
                    <Link href={`/ventas?venta=${s.saleId}`} className="shrink-0 text-sm font-semibold text-amber-700 hover:underline dark:text-amber-400">
                      Ver venta →
                    </Link>
                  )}
                </div>
              </div>
            ))
          )}

          {c.porPersona.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-border bg-background">
              <div className="px-4 pb-2 pt-3.5">
                <p className="text-[15px] font-semibold">Efectivo por persona</p>
                <p className="text-xs text-muted-foreground">Quién cobró, no quién vendió</p>
              </div>
              {c.porPersona.map((p) => (
                <div key={p.quien} className="flex items-center gap-3 border-t border-border/70 px-4 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-foreground">
                    {p.quien.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.quien}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {p.entradasCents || p.salidasCents
                        ? `cobró ${formatMXN(p.entradasCents)} · sacó ${formatMXN(p.salidasCents)}`
                        : "sin efectivo"}
                      {p.otros > 0 && ` · ${p.otros} sin efectivo`}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{formatMXN(p.entradasCents - p.salidasCents)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ContarEfectivo
        open={contar !== null}
        onClose={() => setContar(null)}
        tipo={contar ?? "conteo"}
        fecha={c.fecha}
        fechaLabel={diaLargo(c.fecha)}
        sucursalId={c.sucursalId}
        sucursalNombre={sucNombre}
        esperadoCents={c.esperadoCents}
        fondoSugeridoCents={c.fondoCents ?? 0}
        pistas={c.sospechosos.map((s) => ({ titulo: s.titulo, detalle: s.detalle, montoCents: s.montoCents }))}
      />
    </section>
  );
}

function Estado({ tono, children }: { tono: "ok" | "mal" | "gris"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "self-start whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        tono === "ok" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
        tono === "mal" && "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
        tono === "gris" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function Cifra({ label, valor, sub, tono, fuerte }: { label: string; valor: string; sub?: string; tono?: "ok" | "mal"; fuerte?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-r border-border/70 px-4 py-3.5 lg:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-xl font-semibold tabular-nums",
          fuerte && "text-2xl",
          tono === "ok" && "text-emerald-700 dark:text-emerald-400",
          tono === "mal" && "text-red-700 dark:text-red-400",
        )}
      >
        {valor}
      </span>
      {sub && <span className="truncate text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

function FilaEvento({ e, saldo }: { e: EventoCaja; saldo: number | null }) {
  const Icon = ICONO[e.tipo];
  const entra = e.montoCents > 0;
  return (
    <li className={cn("flex items-center gap-3 border-t border-border/70 px-4 py-2.5 sm:px-5", e.marca && "bg-amber-50/60 dark:bg-amber-950/20", saldo == null && "opacity-60")}>
      <span className="hidden w-20 shrink-0 font-mono text-xs text-muted-foreground sm:block">{hora(e.fecha)}</span>
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          entra ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
          <span className="truncate">
            {TITULO[e.tipo]} · {e.titulo}
          </span>
          {e.marca && (
            <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
              {e.marca}
            </span>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          <span className="sm:hidden">{hora(e.fecha)} · </span>
          {[e.quien, e.detalle, saldo == null ? e.metodo : null].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={cn("text-sm font-semibold tabular-nums", entra ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
          {signo(e.montoCents)}
        </p>
        {saldo != null ? (
          <p className="text-[11px] tabular-nums text-muted-foreground">debería haber {formatMXN(saldo)}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground">no pasa por el cajón</p>
        )}
      </div>
    </li>
  );
}

function FilaConteo({ c, primero }: { c: ConteoCaja; primero: boolean }) {
  const dif = c.contadoCents - c.esperadoAhoraCents;
  const ok = dif === 0;
  return (
    <>
      <li
        className={cn(
          "flex items-center gap-3 border-y px-4 py-2.5 sm:px-5",
          ok ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30" : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30",
        )}
      >
        <span className="hidden w-20 shrink-0 font-mono text-xs sm:block">{hora(c.createdAt)}</span>
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background", ok ? "text-emerald-700" : "text-red-700")}>
          <Banknote className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {c.tipo === "cierre" ? "Cierre del día" : "Conteo"}
            <span className="font-normal text-muted-foreground sm:hidden"> · {hora(c.createdAt)}</span>
          </p>
          <p className={cn("truncate text-xs", ok ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300")}>
            {c.quien} contó {formatMXN(c.contadoCents)} · {ok ? "cuadró" : dif < 0 ? `faltaban ${formatMXN(-dif)}` : `sobraban ${formatMXN(dif)}`}
            {c.nota && ` · “${c.nota}”`}
          </p>
        </div>
        <span className={cn("shrink-0 text-sm font-bold tabular-nums", ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
          {ok ? <Check className="h-4 w-4" /> : signo(dif)}
        </span>
      </li>
      {primero && !ok && c.tipo === "conteo" && (
        <li className="flex items-center gap-1.5 px-4 py-1.5 text-xs text-amber-700 sm:pl-[8.5rem] dark:text-amber-400">
          La diferencia ya existía a las {hora(c.createdAt)}: busca en los movimientos de arriba.
        </li>
      )}
    </>
  );
}
