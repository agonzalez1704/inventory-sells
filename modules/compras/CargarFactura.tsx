"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  UploadCloud,
  FileDown,
  AlertTriangle,
  CheckCircle2,
  Search,
  Trash2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMXN } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { buscarProductos } from "@/modules/inventory/buscar";
import {
  analizarFactura,
  aplicarLineas,
  subirFactura,
  type AnalisisFactura,
  type LineaPropuesta,
  type Origen,
} from "./factura-actions";

// How each line found its product, and how much scrutiny it deserves. An exact
// key needs none; a text match needs eyes on it, because attaching stock to the
// wrong product builds a cost layer against it — an error that surfaces later as
// a margin, never as a failure.
const ORIGEN: Record<Origen, { texto: string; tono: "success" | "accent" | "warning" | "danger" }> = {
  sku: { texto: "Por SKU", tono: "success" },
  equivalencia: { texto: "Clave del proveedor", tono: "success" },
  busqueda: { texto: "Coincidencia por texto — revisa", tono: "warning" },
  sin_match: { texto: "Sin producto", tono: "danger" },
};

type Editable = LineaPropuesta & { incluir: boolean };

export function CargarFactura({ compraId }: { compraId: string }) {
  const router = useRouter();
  const [analisis, setAnalisis] = useState<AnalisisFactura | null>(null);
  const [lineas, setLineas] = useState<Editable[]>([]);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [pending, start] = useTransition();

  async function onArchivo(file: File) {
    setArchivo(file);
    setLeyendo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await analizarFactura(compraId, fd);
      setAnalisis(res);
      setLineas(res.lineas.map((l) => ({ ...l, incluir: l.productId != null })));
      if (res.lineas.length === 0) toast.error("No encontré líneas de producto en el archivo");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo leer el archivo");
      setArchivo(null);
    } finally {
      setLeyendo(false);
    }
  }

  function set(i: number, patch: Partial<Editable>) {
    setLineas((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  const incluidas = lineas.filter((l) => l.incluir && l.productId);
  const dudosas = lineas.filter((l) => l.incluir && l.origen === "busqueda").length;
  const sinProducto = lineas.filter((l) => !l.productId).length;
  const total = incluidas.reduce((s, l) => s + l.cantidad * (l.costo ?? 0), 0);

  function aplicar() {
    if (!incluidas.length) return;
    start(async () => {
      try {
        const r = await aplicarLineas(
          compraId,
          incluidas.map((l) => ({
            productId: l.productId!,
            cantidad: l.cantidad,
            costo: l.costo,
            pedido: l.pedido,
            // Only worth teaching when the document carried the supplier's code.
            skuProveedor: l.skuProveedor || undefined,
          })),
        );
        // Keep the document itself: a shop wants the invoice on file, not just
        // the numbers it produced.
        if (archivo) {
          const fd = new FormData();
          fd.append("file", archivo);
          await subirFactura(compraId, fd).catch(() => {});
        }
        toast.success(
          `${r.agregadas} líneas capturadas` +
            (r.recordadas ? ` · ${r.recordadas} claves de proveedor recordadas` : ""),
        );
        setAnalisis(null);
        setLineas([]);
        setArchivo(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudieron capturar las líneas");
      }
    });
  }

  if (!analisis) {
    return (
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Cargar factura o lista</p>
          <a href="/api/compras/plantilla" className="shrink-0">
            <Button variant="secondary" size="sm">
              <FileDown className="h-4 w-4" />
              Descargar plantilla
            </Button>
          </a>
        </div>
        <label
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed border-border px-4 py-6 text-center transition-colors hover:bg-muted/40",
            leyendo && "pointer-events-none opacity-60",
          )}
        >
          <UploadCloud className="h-6 w-6 text-muted-foreground" />
          <span className="text-sm font-medium">
            {leyendo ? "Leyendo el archivo…" : "Excel, CSV, PDF o foto"}
          </span>
          <span className="text-xs text-muted-foreground">
            Nada se captura hasta que lo revises
          </span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv,application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onArchivo(f);
            }}
          />
        </label>
      </Card>
    );
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Revisa antes de capturar</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {analisis.modo === "plantilla"
              ? "Plantilla reconocida: las columnas se leyeron tal cual."
              : "Leído del documento con IA — conviene revisar cada línea."}
            {analisis.folio && ` · Folio detectado: ${analisis.folio}`}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { setAnalisis(null); setArchivo(null); }}>
          Cancelar
        </Button>
      </div>

      {(dudosas > 0 || sinProducto > 0) && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-600/25 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {dudosas > 0 && `${dudosas} línea${dudosas === 1 ? "" : "s"} empataron por texto. `}
            {sinProducto > 0 && `${sinProducto} sin producto: búscalo o desmárcala. `}
            Una línea en el producto equivocado sube stock donde no va y ensucia el costo.
          </span>
        </div>
      )}

      {analisis.ignoradas.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {analisis.ignoradas.length} fila(s) omitidas:{" "}
          {analisis.ignoradas.slice(0, 3).map((i) => `fila ${i.fila} (${i.motivo})`).join(", ")}
          {analisis.ignoradas.length > 3 && "…"}
        </p>
      )}

      <ul className="divide-y divide-border rounded-xl border border-border">
        {lineas.map((l, i) => (
          <FilaRevision key={`${l.ref}-${i}`} l={l} onChange={(p) => set(i, p)} />
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-xs text-muted-foreground">
          {incluidas.length} de {lineas.length} líneas ·{" "}
          {incluidas.reduce((s, l) => s + l.cantidad, 0)} piezas · {formatMXN(Math.round(total * 100))}
        </span>
        <Button onClick={aplicar} loading={pending} disabled={!incluidas.length}>
          <CheckCircle2 className="h-4 w-4" />
          Capturar {incluidas.length} líneas
        </Button>
      </div>
    </Card>
  );
}

function FilaRevision({
  l,
  onChange,
}: {
  l: Editable;
  onChange: (p: Partial<Editable>) => void;
}) {
  const [buscando, setBuscando] = useState(false);
  const [q, setQ] = useState("");
  const [opciones, setOpciones] = useState<{ id: string; sku: string; name: string }[]>([]);

  const buscar = useCallback(async (texto: string) => {
    setQ(texto);
    if (texto.trim().length < 2) return setOpciones([]);
    const rows = await buscarProductos({ query: texto, limit: 6 });
    setOpciones(rows.map((p) => ({ id: p.id, sku: p.sku, name: p.name })));
  }, []);

  const info = ORIGEN[l.origen];

  return (
    <li className={cn("space-y-2 p-3", !l.incluir && "opacity-50")}>
      <div className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={l.incluir}
          onChange={(e) => onChange({ incluir: e.target.checked })}
          disabled={!l.productId}
          className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-accent disabled:cursor-not-allowed"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{l.descripcion || l.skuProveedor || "—"}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Badge tone={info.tono}>{info.texto}</Badge>
            {l.productoNombre && (
              <span className="truncate">
                → {l.productoNombre} <span className="font-mono">({l.productoSku})</span>
              </span>
            )}
            {l.skuProveedor && <span className="font-mono">clave: {l.skuProveedor}</span>}
          </p>
        </div>
        <button
          onClick={() => setBuscando((b) => !b)}
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={l.productId ? "Cambiar producto" : "Buscar producto"}
        >
          {l.productId ? <Search className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2 pl-6">
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-muted-foreground">Cantidad</span>
          <Input
            value={String(l.cantidad)}
            onChange={(e) => onChange({ cantidad: Math.max(0, parseInt(e.target.value, 10) || 0) })}
            inputMode="numeric"
            className="h-8 w-20"
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-muted-foreground">Costo unit.</span>
          <Input
            value={l.costo == null ? "" : String(l.costo)}
            onChange={(e) => {
              const n = parseFloat(e.target.value.replace(",", "."));
              onChange({ costo: Number.isFinite(n) ? n : null });
            }}
            inputMode="decimal"
            placeholder="—"
            className="h-8 w-24"
          />
        </label>
        {l.pedido != null && (
          <span className="pb-1.5 text-[11px] text-muted-foreground">
            pedido: {l.pedido}
            {l.cantidad !== l.pedido && (
              <strong className={cn("ml-1", l.cantidad < l.pedido ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400")}>
                {l.cantidad < l.pedido ? `faltaron ${l.pedido - l.cantidad}` : `+${l.cantidad - l.pedido}`}
              </strong>
            )}
          </span>
        )}
        {l.costo == null && (
          <span className="pb-1.5 text-[11px] text-amber-700 dark:text-amber-300">
            Sin costo: no se creará capa FIFO
          </span>
        )}
      </div>

      {buscando && (
        <div className="space-y-1.5 pl-6">
          <Input
            value={q}
            onChange={(e) => buscar(e.target.value)}
            placeholder="Buscar producto por nombre o SKU…"
            className="h-8"
          />
          {opciones.map((o) => (
            <button
              key={o.id}
              onClick={() => {
                onChange({
                  productId: o.id,
                  productoNombre: o.name,
                  productoSku: o.sku,
                  origen: "equivalencia",
                  incluir: true,
                });
                setBuscando(false);
                setOpciones([]);
                setQ("");
              }}
              className="flex w-full items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted"
            >
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              <span className="shrink-0 font-mono text-muted-foreground">{o.sku}</span>
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
