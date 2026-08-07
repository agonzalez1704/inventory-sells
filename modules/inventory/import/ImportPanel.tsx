"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Image as ImageIcon,
  Sheet,
  FileText,
  UploadCloud,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import type { Inventory } from "@/lib/types";
import type { ExtractedRow, ImportSource } from "./schema";
import { parseSpreadsheet } from "./parse-spreadsheet";
import {
  extractFromUpload,
  commitImport,
  createInventoryWithImport,
  previewImport,
  type ModoImport,
  type Preview,
} from "./actions";
import { createInventory } from "../inventories";

// Rows per request. Small enough that one chunk can't time out, large enough
// that a 21k catalog is a couple of dozen round trips rather than hundreds.
const LOTE = 1000;

// A stock figure above this is not a count, it is a service line an ERP keeps in
// the same table — the refaccionaria's export carries "MANIOBA DE ENVIO" with
// 100,104,561. Importing it creates a product with a hundred million units and a
// ledger movement to match. Held back and named rather than dropped quietly:
// the row is real, it just isn't a product.
const EXISTENCIA_INVEROSIMIL = 10_000;

type Format = "image" | "spreadsheet" | "pdf";
type Status = "idle" | "reading" | "review" | "done";

const FORMATS: {
  key: Format;
  label: string;
  icon: typeof ImageIcon;
  accept: string;
  hint: string;
}[] = [
  { key: "image", label: "Imagen", icon: ImageIcon, accept: "image/png,image/jpeg", hint: "Foto JPEG o PNG de una lista, etiqueta o factura" },
  { key: "spreadsheet", label: "Excel / CSV", icon: Sheet, accept: ".xlsx,.xls,.csv", hint: "Hoja con columnas (sku, nombre, precio, cantidad…)" },
  { key: "pdf", label: "PDF", icon: FileText, accept: "application/pdf", hint: "Documento PDF de inventario" },
];

export function ImportPanel({
  inventories = [],
  defaultInventoryId,
  newMode = false,
  onClose,
}: {
  inventories?: Inventory[];
  defaultInventoryId?: string;
  newMode?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [inventoryId, setInventoryId] = useState(
    defaultInventoryId || inventories[0]?.id || "",
  );
  const [name, setName] = useState("");
  const [format, setFormat] = useState<Format>("image");
  const [status, setStatus] = useState<Status>("idle");
  const [rows, setRows] = useState<ExtractedRow[]>([]);
  const [source, setSource] = useState<ImportSource>("image");
  const [filename, setFilename] = useState<string | null>(null);
  const [costMode, setCostModeState] = useState(false);
  const [margin, setMargin] = useState("");
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);
  const [modo, setModo] = useState<ModoImport>("alta");
  const [avance, setAvance] = useState(0);
  const [descartadas, setDescartadas] = useState<ExtractedRow[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);

  const fmt = FORMATS.find((f) => f.key === format)!;

  function reset() {
    setRows([]);
    setDescartadas([]);
    setStatus("idle");
    setFilename(null);
    setCostModeState(false);
    setMargin("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(file: File) {
    setStatus("reading");
    try {
      if (format === "spreadsheet") {
        const parsed = await parseSpreadsheet(file);
        if (parsed.length === 0) throw new Error("No se encontraron filas con SKU.");
        const raras = parsed.filter((r) => (r.quantity ?? 0) > EXISTENCIA_INVEROSIMIL);
        setDescartadas(raras);
        setRows(parsed.filter((r) => (r.quantity ?? 0) <= EXISTENCIA_INVEROSIMIL));
        setSource(file.name.toLowerCase().endsWith(".csv") ? "csv" : "excel");
        setFilename(file.name);
        setStatus("review");
      } else {
        const fd = new FormData();
        fd.append("file", file);
        const res = await extractFromUpload(fd);
        if (res.rows.length === 0)
          throw new Error("La IA no extrajo productos. Prueba otra imagen.");
        setRows(res.rows);
        setSource(res.source);
        setFilename(res.filename);
        setStatus("review");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al leer el archivo");
      reset();
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    if (status === "reading") return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function update(i: number, patch: Partial<ExtractedRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
  }

  function setCostMode(next: boolean) {
    setCostModeState(next);
    setRows((rs) =>
      rs.map((r) => {
        if (next)
          return r.cost == null && r.price != null
            ? { ...r, cost: r.price, price: undefined }
            : r;
        return r.price == null && r.cost != null
          ? { ...r, price: r.cost, cost: undefined }
          : r;
      }),
    );
  }
  function applyMargin() {
    const m = parseFloat(margin);
    if (!Number.isFinite(m)) return;
    setRows((rs) =>
      rs.map((r) =>
        r.cost != null
          ? { ...r, price: Math.round(r.cost * (1 + m / 100) * 100) / 100 }
          : r,
      ),
    );
    toast.success("Margen aplicado");
  }

  function confirm() {
    if (newMode && !name.trim()) {
      toast.error("Escribe un nombre para el inventario");
      return;
    }
    if (!newMode && !inventoryId) {
      toast.error("Selecciona un inventario destino");
      return;
    }
    // "Espejo" overwrites stock, so it can wipe sales the POS already recorded.
    // Show what would be lost and make them confirm it, once, before writing.
    if (!newMode && modo === "espejo" && !preview) {
      startTransition(async () => {
        try {
          setPreview(await previewImport(rows, inventoryId, modo));
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Error al revisar");
        }
      });
      return;
    }
    startTransition(async () => {
      try {
        if (newMode) {
          const r = await createInventoryWithImport(name, rows, source, filename);
          toast.success(`"${r.name}" creado · ${r.inserted} productos`);
        } else {
          // Sent in chunks, not in one call. commit_import walks every row in a
          // single plpgsql loop — a SELECT FOR UPDATE, an upsert and a movement
          // apiece — and the refaccionaria's catalog is 21k rows. One request
          // risks the function timing out, and because it is one transaction a
          // timeout at row 18,000 rolls back all of it and the wait buys
          // nothing. Each chunk commits on its own, so progress survives.
          const total = rows.length;
          let inserted = 0, updated = 0, bajas = 0, sinPrecio = 0;
          for (let i = 0; i < total; i += LOTE) {
            const trozo = rows.slice(i, i + LOTE);
            const res = await commitImport(trozo, source, filename, inventoryId, modo);
            inserted += res.inserted;
            updated += res.updated;
            bajas += res.bajas;
            sinPrecio += res.sin_precio;
            if (total > LOTE) setAvance(Math.min(i + LOTE, total));
          }
          toast.success(
            `Importado: ${inserted} nuevos, ${updated} actualizados` +
              (bajas ? ` · ${bajas} bajaron de existencia` : "") +
              (sinPrecio ? ` · ${sinPrecio} sin precio` : ""),
          );
        }
        setStatus("done");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al importar");
      } finally {
        setAvance(0);
      }
    });
  }

  // New-inventory mode: create the inventory empty and add products manually later.
  function createEmpty() {
    if (!name.trim()) {
      toast.error("Escribe un nombre para el inventario");
      return;
    }
    startTransition(async () => {
      try {
        const inv = await createInventory(name);
        toast.success(`Inventario "${inv.name}" creado`);
        router.refresh();
        onClose?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al crear");
      }
    });
  }

  if (status === "done") {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent">
          <CheckCircle2 className="h-6 w-6" />
        </span>
        <p className="mt-3 text-sm font-medium">
          {newMode ? "Inventario creado" : "Inventario importado"}
        </p>
        <div className="mt-5 flex gap-2">
          {!newMode && (
            <Button variant="secondary" onClick={reset}>
              Importar otro
            </Button>
          )}
          {onClose && <Button onClick={onClose}>Listo</Button>}
        </div>
      </div>
    );
  }

  return (
    <div>
      {newMode ? (
        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Nombre del inventario
          </span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Moca's displays"
            autoFocus
          />
        </label>
      ) : (
        inventories.length > 0 && (
          <label className="mb-3 block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Inventario destino
            </span>
            <Select
              value={inventoryId}
              onChange={(e) => setInventoryId(e.target.value)}
            >
              {inventories.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.name}
                </option>
              ))}
            </Select>
          </label>
        )
      )}

      {/* What the quantity column means. Getting this wrong is how stock gets
          silently doubled (re-importing a full export as if it were a delivery)
          or how sales get erased (mirroring after the ERP cutover). */}
      {!newMode && (
        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Qué significan las existencias del archivo
          </span>
          <Select
            value={modo}
            onChange={(e) => {
              setModo(e.target.value as ModoImport);
              setPreview(null);
            }}
          >
            <option value="alta">Llegó mercancía — sumar a lo que hay</option>
            <option value="espejo">
              El archivo es el inventario — reemplazar existencias
            </option>
            <option value="catalogo">
              Solo catálogo — no tocar existencias (precios, nombres, costos)
            </option>
          </Select>
          {modo === "espejo" && (
            <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">
              Reemplaza las existencias con las del archivo. Si el POS ya vendió
              algo que el archivo no refleja, esa venta se pierde del conteo.
            </span>
          )}
        </label>
      )}

      {descartadas.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-600/25 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-medium">
            {descartadas.length} fila(s) apartadas por existencia inverosímil
          </p>
          <ul className="mt-1 space-y-0.5">
            {descartadas.slice(0, 5).map((r) => (
              <li key={r.sku}>
                {r.sku} · {r.name} — {(r.quantity ?? 0).toLocaleString("es-MX")} piezas
              </li>
            ))}
          </ul>
          <p className="mt-1">
            Suelen ser conceptos de servicio (fletes, maniobras) que el ERP guarda
            junto a los productos. No se importan; si alguna es real, agrégala a mano.
          </p>
        </div>
      )}

      {preview && (
        <div className="mb-3 rounded-lg border border-amber-600/25 bg-amber-50 dark:bg-amber-950/30 p-3">
          <p className="text-sm font-medium">Revisa antes de reemplazar</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {preview.nuevos} nuevos · {preview.existentes} existentes ·{" "}
            {preview.suben} suben · <strong>{preview.bajan} bajan</strong> ·{" "}
            {preview.igual} sin cambio
            {preview.sinPrecio > 0 && ` · ${preview.sinPrecio} sin precio`}
          </p>
          {preview.bajasTop.length > 0 && (
            <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto text-xs">
              {preview.bajasTop.map((b) => (
                <li key={b.sku} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">{b.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {b.de} → {b.a}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Vuelve a presionar Importar para aplicarlo.
          </p>
        </div>
      )}

      {/* Format segmented control */}
      <div className="inline-flex rounded-lg bg-muted p-0.5">
        {FORMATS.map((f) => {
          const Icon = f.icon;
          return (
            <button
              key={f.key}
              onClick={() => {
                setFormat(f.key);
                reset();
              }}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                format === f.key
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {f.label}
            </button>
          );
        })}
      </div>

      {status !== "review" ? (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            if (status !== "reading") setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center transition-colors hover:border-ring/40 hover:bg-muted/50",
            dragging && "border-ring/70 bg-muted/60",
            status === "reading" && "pointer-events-none opacity-70",
          )}
        >
          <input
            ref={fileRef}
            type="file"
            accept={fmt.accept}
            onChange={onFile}
            disabled={status === "reading"}
            className="sr-only"
          />
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-background text-muted-foreground shadow-xs">
            <UploadCloud className="h-5 w-5" />
          </span>
          <span className="mt-3 text-sm font-medium">
            {status === "reading"
              ? format === "spreadsheet"
                ? "Leyendo archivo…"
                : "Extrayendo con IA…"
              : dragging
                ? "Suelta el archivo aquí"
                : "Haz clic o arrastra un archivo aquí"}
          </span>
          <span className="mt-1 text-xs text-muted-foreground">{fmt.hint}</span>
        </label>
      ) : null}

      {newMode && status === "idle" && (
        <div className="mt-3 text-center">
          <button
            onClick={createEmpty}
            disabled={pending}
            className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
          >
            o crea el inventario vacío y agrega productos manualmente
          </button>
        </div>
      )}

      {status === "review" && (
        <ReviewStep
          rows={rows}
          costMode={costMode}
          margin={margin}
          busy={pending}
          onUpdate={update}
          onRemove={removeRow}
          onSetCostMode={setCostMode}
          onMargin={setMargin}
          onApplyMargin={applyMargin}
          onConfirm={confirm}
          onCancel={reset}
          avance={avance}
        />
      )}
    </div>
  );
}

function ReviewStep({
  avance,
  rows,
  costMode,
  margin,
  busy,
  onUpdate,
  onRemove,
  onSetCostMode,
  onMargin,
  onApplyMargin,
  onConfirm,
  onCancel,
}: {
  rows: ExtractedRow[];
  costMode: boolean;
  margin: string;
  busy: boolean;
  onUpdate: (i: number, patch: Partial<ExtractedRow>) => void;
  onRemove: (i: number) => void;
  onSetCostMode: (next: boolean) => void;
  onMargin: (v: string) => void;
  onApplyMargin: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  /** Rows written so far. 0 when not chunking, so nothing is shown. */
  avance: number;
}) {
  const num = (v: number | undefined) => (v == null ? "" : String(v));
  const toNum = (s: string) => (s.trim() === "" ? undefined : Number(s));

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-muted/50 px-3 py-2.5 text-xs">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={costMode}
            onChange={(e) => onSetCostMode(e.target.checked)}
            className="h-3.5 w-3.5 cursor-pointer accent-[hsl(var(--accent))]"
          />
          El precio del archivo es el <strong>costo</strong> de compra
        </label>
        {costMode && (
          <span className="flex items-center gap-2">
            <span className="text-muted-foreground">Margen %</span>
            <Input
              type="number"
              min={0}
              value={margin}
              onChange={(e) => onMargin(e.target.value)}
              placeholder="40"
              className="h-8 w-20"
            />
            <Button size="sm" variant="secondary" onClick={onApplyMargin}>
              Aplicar
            </Button>
          </span>
        )}
      </div>

      <div className="mt-3 max-h-[22rem] overflow-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
            <tr>
              {["SKU", "Nombre", "Categoría", "Marca", "Talla", "Color", "Specs", "Costo", "Precio", "Cant.", ""].map(
                (h) => (
                  <th key={h} className="whitespace-nowrap px-2 py-2 font-medium">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const specs = (r.attributes ?? [])
                .map((a) => `${a.key}: ${a.value}`)
                .join(" · ");
              return (
                <tr key={i} className="border-t border-border/60">
                  <EditCell value={r.sku} onChange={(v) => onUpdate(i, { sku: v })} mono />
                  <EditCell value={r.name ?? ""} onChange={(v) => onUpdate(i, { name: v || undefined })} />
                  <EditCell value={r.category ?? ""} onChange={(v) => onUpdate(i, { category: v || undefined })} />
                  <EditCell value={r.brand ?? ""} onChange={(v) => onUpdate(i, { brand: v || undefined })} />
                  <EditCell value={r.size ?? ""} onChange={(v) => onUpdate(i, { size: v || undefined })} />
                  <EditCell value={r.color ?? ""} onChange={(v) => onUpdate(i, { color: v || undefined })} />
                  <td
                    className="max-w-[11rem] truncate px-2 py-1 text-muted-foreground"
                    title={specs}
                  >
                    {specs || "—"}
                  </td>
                  <NumCell value={num(r.cost)} onChange={(v) => onUpdate(i, { cost: toNum(v) })} />
                  <NumCell value={num(r.price)} onChange={(v) => onUpdate(i, { price: toNum(v) })} />
                  <NumCell value={num(r.quantity)} onChange={(v) => onUpdate(i, { quantity: toNum(v) })} step={1} />
                  <td className="px-1 py-1">
                    <button
                      onClick={() => onRemove(i)}
                      aria-label="Quitar fila"
                      className="cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:bg-red-50 dark:bg-red-950/40 hover:text-red-600 dark:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {/* A 21k catalog is a couple of dozen requests; without a count it
              looks frozen and someone reloads the tab mid-import. */}
          {avance > 0
            ? `Escribiendo ${avance.toLocaleString("es-MX")} de ${rows.length.toLocaleString("es-MX")}…`
            : `${rows.length.toLocaleString("es-MX")} fila(s) · precios en pesos`}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} loading={busy} disabled={rows.length === 0}>
            Confirmar {rows.length}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EditCell({
  value,
  onChange,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
}) {
  return (
    <td className="px-1 py-1">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full min-w-[5rem] rounded border border-transparent bg-transparent px-1.5 py-1 transition-colors hover:border-border focus:border-ring focus:bg-background focus:outline-none",
          mono && "font-mono",
        )}
      />
    </td>
  );
}

function NumCell({
  value,
  onChange,
  step,
}: {
  value: string;
  onChange: (v: string) => void;
  step?: number;
}) {
  return (
    <td className="px-1 py-1">
      <input
        type="number"
        inputMode="decimal"
        step={step ?? "0.01"}
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-16 rounded border border-transparent bg-transparent px-1.5 py-1 text-right tabular-nums transition-colors hover:border-border focus:border-ring focus:bg-background focus:outline-none"
      />
    </td>
  );
}
