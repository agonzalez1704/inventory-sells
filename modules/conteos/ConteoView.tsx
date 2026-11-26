"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, Search, ScanLine, Check, Loader2, AlertCircle, Download, Lock, Wand2, X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/use-confirm";
import { cn } from "@/lib/utils";
import { unwrap } from "@/lib/errors";
import { formatMXN } from "@/lib/money";
import { EscanerQR } from "@/modules/inventory/EscanerQR";
import { buscarProductos } from "@/modules/inventory/buscar";
import { idDeCodigo } from "@/modules/inventory/qr";
import type { MotivoAjuste } from "@/modules/inventory/panel-actions";
import { aplicarConteo, cerrarConteo, contarItem, type ConteoDetalle, type ConteoItem } from "./actions";

type Guardado = "idle" | "saving" | "saved" | "error";
type Filtro = "todos" | "sin" | "contados" | "dif";

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

// Entries that failed to reach the server wait here and are retried on the
// next load — a dead spot in the shop's wifi must not cost a shelf's work.
const colaKey = (id: string) => `conteo-pendiente:${id}`;
function leerCola(id: string): Record<string, number | null> {
  try {
    return JSON.parse(localStorage.getItem(colaKey(id)) ?? "{}");
  } catch {
    return {};
  }
}
function escribirCola(id: string, cola: Record<string, number | null>) {
  try {
    if (Object.keys(cola).length === 0) localStorage.removeItem(colaKey(id));
    else localStorage.setItem(colaKey(id), JSON.stringify(cola));
  } catch {}
}

/**
 * One count: the person on the ladder searches a model, sees what the system
 * says, types what they found. Every entry saves on its own. Whoever manages
 * the inventory closes it into the report and, if they choose, applies it.
 */
export function ConteoView({ conteo, puedeGestionar }: { conteo: ConteoDetalle; puedeGestionar: boolean }) {
  const router = useRouter();
  const [confirmar, dialogo] = useConfirm();
  const [pending, start] = useTransition();
  const [items, setItems] = useState<ConteoItem[]>(conteo.items);
  const [estado, setEstado] = useState<Record<string, Guardado>>({});
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>(conteo.estado === "abierto" ? "sin" : "dif");
  // The catalog search the register uses: "samsung a06" finds that model's
  // screens, whichever shelf they sit on. Null while there is no query.
  const [resultados, setResultados] = useState<string[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [escaneando, setEscaneando] = useState(false);
  const [motivo, setMotivo] = useState<MotivoAjuste>(conteo.motivo?.toLowerCase().includes("sustra") || conteo.motivo?.toLowerCase().includes("robo") ? "robo" : "conteo");
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const abierto = conteo.estado === "abierto";

  const guardar = useCallback(
    async (productId: string, valor: number | null) => {
      setEstado((s) => ({ ...s, [productId]: "saving" }));
      try {
        const { esperado } = unwrap(await contarItem(conteo.id, productId, valor));
        setItems((prev) =>
          prev.map((i) => (i.product_id === productId ? { ...i, contado: valor, esperado, contado_at: valor === null ? null : new Date().toISOString() } : i)),
        );
        setEstado((s) => ({ ...s, [productId]: "saved" }));
        const cola = leerCola(conteo.id);
        if (productId in cola) {
          delete cola[productId];
          escribirCola(conteo.id, cola);
        }
      } catch (e) {
        setEstado((s) => ({ ...s, [productId]: "error" }));
        escribirCola(conteo.id, { ...leerCola(conteo.id), [productId]: valor });
        toast.error(e instanceof Error ? e.message : "No se guardó; se reintenta al recargar");
      }
    },
    [conteo.id],
  );

  useEffect(() => {
    const texto = q.trim();
    if (texto.length < 2) {
      setResultados(null);
      setBuscando(false);
      return;
    }
    let cancelado = false;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const r = await buscarProductos({ query: texto, limit: 40 });
        if (cancelado) return;
        // A product created after the count opened still has to be countable:
        // it joins the list here and the save inserts it.
        setItems((prev) => {
          const vistos = new Set(prev.map((i) => i.product_id));
          const nuevos = r
            .filter((p) => !vistos.has(p.id))
            .map((p) => ({
              product_id: p.id,
              nombre: p.name,
              sku: p.sku,
              inventario: p.inventory_name ?? "",
              esperado: p.quantity,
              contado: null,
              cost_cents: p.cost_cents,
              price_cents: p.price_cents,
              contado_at: null,
            }));
          return nuevos.length ? [...prev, ...nuevos] : prev;
        });
        setResultados(r.map((p) => p.id));
      } catch {
        if (!cancelado) setResultados([]);
      } finally {
        if (!cancelado) setBuscando(false);
      }
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [q]);

  // Flush what a previous visit could not send.
  useEffect(() => {
    if (!abierto) return;
    const cola = leerCola(conteo.id);
    const ids = Object.keys(cola);
    if (ids.length === 0) return;
    toast.info(`Guardando ${ids.length} capturas pendientes…`);
    ids.forEach((id) => void guardar(id, cola[id]));
  }, [abierto, conteo.id, guardar]);

  function capturar(productId: string, texto: string) {
    const valor = texto.trim() === "" ? null : Math.max(0, parseInt(texto, 10) || 0);
    // Paint now, save after the thumb stops.
    setItems((prev) => prev.map((i) => (i.product_id === productId ? { ...i, contado: valor } : i)));
    setEstado((s) => ({ ...s, [productId]: "idle" }));
    const t = timers.current.get(productId);
    if (t) clearTimeout(t);
    timers.current.set(productId, setTimeout(() => void guardar(productId, valor), 600));
  }

  function guardarYa(productId: string) {
    const t = timers.current.get(productId);
    if (!t) return;
    clearTimeout(t);
    timers.current.delete(productId);
    const it = items.find((i) => i.product_id === productId);
    void guardar(productId, it?.contado ?? null);
  }

  function alEscanear(texto: string) {
    const id = idDeCodigo(texto);
    const it = id ? items.find((i) => i.product_id === id) : null;
    setEscaneando(false);
    if (!it) return toast.error("Esa etiqueta no es de este conteo");
    setQ(it.sku);
    setTimeout(() => inputs.current.get(it.product_id)?.focus(), 50);
  }

  const total = items.length;
  const contados = items.filter((i) => i.contado !== null).length;
  const diferencias = useMemo(
    () => items.filter((i) => i.contado !== null && i.contado !== i.esperado),
    [items],
  );
  const resumen = useMemo(() => {
    let faltanPz = 0, faltanCosto = 0, faltanVenta = 0, sobranPz = 0, sobranCosto = 0;
    for (const i of diferencias) {
      const d = (i.contado as number) - i.esperado;
      if (d < 0) {
        faltanPz -= d;
        faltanCosto -= d * i.cost_cents;
        faltanVenta -= d * i.price_cents;
      } else {
        sobranPz += d;
        sobranCosto += d * i.cost_cents;
      }
    }
    return { faltanPz, faltanCosto, faltanVenta, sobranPz, sobranCosto, modelos: diferencias.filter((i) => (i.contado as number) < i.esperado).length };
  }, [diferencias]);

  const visibles = useMemo(() => {
    if (resultados !== null) {
      // Search order is the ranking's, not the shelf's.
      const porId = new Map(items.map((i) => [i.product_id, i]));
      return resultados.map((id) => porId.get(id)).filter((i): i is ConteoItem => !!i);
    }
    return items.filter((i) => {
      if (filtro === "sin" && i.contado !== null) return false;
      if (filtro === "contados" && i.contado === null) return false;
      if (filtro === "dif" && (i.contado === null || i.contado === i.esperado)) return false;
      return true;
    });
  }, [items, filtro, resultados]);

  async function cerrar() {
    const faltan = total - contados;
    const ok = await confirmar({
      title: "¿Cerrar el conteo?",
      description:
        faltan > 0
          ? `Hay ${faltan} productos sin contar: quedan fuera del reporte, no cuentan como cero. Ya no se podrá capturar nada.`
          : "Ya no se podrá capturar nada. El reporte queda como está.",
      confirmLabel: "Cerrar conteo",
    });
    if (!ok) return;
    start(async () => {
      try {
        unwrap(await cerrarConteo(conteo.id));
        toast.success("Conteo cerrado");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo cerrar");
      }
    });
  }

  async function aplicar() {
    const ok = await confirmar({
      title: "¿Ajustar el inventario al conteo?",
      description: `${diferencias.length} productos cambian de existencia. Cada uno queda como un ajuste con motivo "${MOTIVOS[motivo]}" en su cardex.`,
      confirmLabel: "Aplicar",
      tone: "danger",
    });
    if (!ok) return;
    start(async () => {
      try {
        const r = unwrap(await aplicarConteo(conteo.id, motivo));
        toast.success(`${r.ajustados} productos ajustados`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo aplicar");
      }
    });
  }

  function exportar() {
    const filas = [
      ["Producto", "SKU", "Sistema", "Contado", "Diferencia", "Costo", "Precio", "Dif. a costo", "Dif. a precio"],
      ...items
        .filter((i) => i.contado !== null)
        .map((i) => {
          const d = (i.contado as number) - i.esperado;
          return [i.nombre, i.sku, i.esperado, i.contado, d, i.cost_cents / 100, i.price_cents / 100, (d * i.cost_cents) / 100, (d * i.price_cents) / 100];
        }),
    ];
    const csv = filas.map((f) => f.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${conteo.nombre.replace(/[^\w-]+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <section className="space-y-4 pb-24">
      <div>
        <Link href="/conteos" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Conteos
        </Link>
        <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          {conteo.nombre}
          <Badge tone={abierto ? "accent" : conteo.estado === "aplicado" ? "success" : "neutral"}>
            {abierto ? "En curso" : conteo.estado === "aplicado" ? "Aplicado" : "Cerrado"}
          </Badge>
        </h1>
        <p className="text-sm text-muted-foreground">
          {conteo.inventario} · abierto {fecha(conteo.created_at)}
          {conteo.cerrado_at ? ` · cerrado ${fecha(conteo.cerrado_at)}` : ""}
          {conteo.motivo ? ` · ${conteo.motivo}` : ""}
        </p>
      </div>

      {/* Progress: the only number that matters while counting. */}
      <Card className="space-y-2 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{contados} de {total} contados</span>
          <span className="text-muted-foreground">{total - contados} sin contar</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${total ? (contados / total) * 100 : 0}%` }} />
        </div>
        {!abierto && (
          <p className="text-xs text-muted-foreground">
            Cada producto se comparó con el sistema en el momento en que se contó.
          </p>
        )}
      </Card>

      {(puedeGestionar || !abierto) && (
        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Dato label="Modelos con faltante" valor={String(resumen.modelos)} />
            <Dato label="Piezas faltantes" valor={String(resumen.faltanPz)} tono="danger" />
            <Dato label="Faltante a costo" valor={formatMXN(resumen.faltanCosto)} tono="danger" />
            <Dato label="Faltante a precio de venta" valor={formatMXN(resumen.faltanVenta)} />
          </div>
          {resumen.sobranPz > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              También hay {resumen.sobranPz} piezas de más ({formatMXN(resumen.sobranCosto)} a costo): el sistema tenía menos de lo que hay.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={exportar} disabled={contados === 0}>
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
            {puedeGestionar && abierto && (
              <Button variant="secondary" size="sm" onClick={cerrar} loading={pending}>
                <Lock className="h-4 w-4" />
                Cerrar conteo
              </Button>
            )}
            {puedeGestionar && conteo.estado === "cerrado" && diferencias.length > 0 && (
              <div className="flex items-center gap-2">
                <Select value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoAjuste)} className="h-9 w-40">
                  {(Object.keys(MOTIVOS) as MotivoAjuste[]).map((m) => (
                    <option key={m} value={m}>{MOTIVOS[m]}</option>
                  ))}
                </Select>
                <Button size="sm" onClick={aplicar} loading={pending}>
                  <Wand2 className="h-4 w-4" />
                  Ajustar inventario ({diferencias.length})
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="sticky top-0 z-10 -mx-1 space-y-2 bg-background px-1 py-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Modelo: samsung a06, iphone 13 pro, note 11…"
              className="pl-9 pr-9"
              autoFocus={abierto}
            />
            {buscando && <Loader2 className="absolute right-9 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
            {q && (
              <button type="button" aria-label="Limpiar" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {abierto && (
            <Button variant="secondary" onClick={() => setEscaneando(true)} aria-label="Escanear etiqueta">
              <ScanLine className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className={cn("flex gap-1.5 overflow-x-auto text-xs", resultados !== null && "opacity-50")}>
          {(
            [
              ["sin", `Sin contar (${total - contados})`],
              ["contados", `Contados (${contados})`],
              ["dif", `Con diferencia (${diferencias.length})`],
              ["todos", `Todos (${total})`],
            ] as [Filtro, string][]
          ).map(([f, label]) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={cn(
                "shrink-0 cursor-pointer rounded-full border px-3 py-1 transition-colors",
                filtro === f ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-ring/40",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {resultados !== null
            ? buscando ? "Buscando…" : `Nada coincide con “${q}”.`
            : q ? "Escribe al menos dos letras."
            : filtro === "sin" ? "Todo contado." : "Sin productos aquí."}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {visibles.map((i) => {
            const d = i.contado === null ? null : i.contado - i.esperado;
            const g = estado[i.product_id] ?? "idle";
            return (
              <li key={i.product_id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{i.nombre}</span>
                  <span className="block truncate font-mono text-[11px] uppercase text-muted-foreground">
                    {i.inventario && <span className="font-sans normal-case">{i.inventario} · </span>}
                    {i.sku} · sistema {i.esperado}
                    {d !== null && d !== 0 && (
                      <span className={cn("ml-2 font-sans font-medium normal-case", d < 0 ? "text-red-600" : "text-emerald-600")}>
                        {d > 0 ? `+${d}` : d}
                      </span>
                    )}
                  </span>
                </span>
                {abierto ? (
                  <>
                    {i.contado === null && (
                      <button
                        type="button"
                        onClick={() => capturar(i.product_id, String(i.esperado))}
                        className="cursor-pointer rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                        title="Hay lo que dice el sistema"
                      >
                        = {i.esperado}
                      </button>
                    )}
                    <Input
                      ref={(el) => {
                        if (el) inputs.current.set(i.product_id, el);
                        else inputs.current.delete(i.product_id);
                      }}
                      value={i.contado === null ? "" : String(i.contado)}
                      onChange={(e) => capturar(i.product_id, e.target.value)}
                      onBlur={() => guardarYa(i.product_id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      inputMode="numeric"
                      placeholder="—"
                      className={cn("w-20 text-right", d !== null && d !== 0 && "border-red-400")}
                    />
                    <span className="w-4 shrink-0">
                      {g === "saving" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                      {(g === "saved" || (g === "idle" && i.contado !== null)) && <Check className="h-4 w-4 text-emerald-600" />}
                      {g === "error" && (
                        <button type="button" onClick={() => void guardar(i.product_id, i.contado)} title="Reintentar">
                          <AlertCircle className="h-4 w-4 text-red-600" />
                        </button>
                      )}
                    </span>
                  </>
                ) : (
                  <span className="w-24 text-right font-mono text-sm tabular-nums">
                    {i.contado === null ? <span className="text-muted-foreground">sin contar</span> : i.contado}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {escaneando && <EscanerQR onCodigo={alEscanear} onClose={() => setEscaneando(false)} />}
      {dialogo}
    </section>
  );
}

const MOTIVOS: Record<MotivoAjuste, string> = {
  robo: "Robo",
  conteo: "Conteo",
  danada: "Dañada",
  devolucion: "Devolución",
  otro: "Otro",
};

function Dato({ label, valor, tono }: { label: string; valor: string; tono?: "danger" }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", tono === "danger" && "text-red-600")}>{valor}</p>
    </div>
  );
}
