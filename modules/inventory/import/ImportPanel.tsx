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
import { Input } from "@/components/ui/input";
import type { ExtractedRow, ImportSource } from "./schema";
import { parseSpreadsheet } from "./parse-spreadsheet";
import { extractFromUpload, commitImport } from "./actions";

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

export function ImportPanel({ onClose }: { onClose?: () => void }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [format, setFormat] = useState<Format>("image");
  const [status, setStatus] = useState<Status>("idle");
  const [rows, setRows] = useState<ExtractedRow[]>([]);
  const [source, setSource] = useState<ImportSource>("image");
  const [filename, setFilename] = useState<string | null>(null);
  const [costMode, setCostModeState] = useState(false);
  const [margin, setMargin] = useState("");
  const [pending, startTransition] = useTransition();

  const fmt = FORMATS.find((f) => f.key === format)!;

  function reset() {
    setRows([]);
    setStatus("idle");
    setFilename(null);
    setCostModeState(false);
    setMargin("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("reading");
    try {
      if (format === "spreadsheet") {
        const parsed = await parseSpreadsheet(file);
        if (parsed.length === 0) throw new Error("No se encontraron filas con SKU.");
        setRows(parsed);
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
    startTransition(async () => {
      try {
        const res = await commitImport(rows, source, filename);
        toast.success(
          `Importado: ${res.inserted} nuevos, ${res.updated} actualizados`,
        );
        setStatus("done");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al importar");
      }
    });
  }

  if (status === "done") {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent">
          <CheckCircle2 className="h-6 w-6" />
        </span>
        <p className="mt-3 text-sm font-medium">Inventario importado</p>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" onClick={reset}>
            Importar otro
          </Button>
          {onClose && <Button onClick={onClose}>Listo</Button>}
        </div>
      </div>
    );
  }

  return (
    <div>
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
          className={cn(
            "mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center transition-colors hover:border-ring/40 hover:bg-muted/50",
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
              : "Haz clic para elegir un archivo"}
          </span>
          <span className="mt-1 text-xs text-muted-foreground">{fmt.hint}</span>
        </label>
      ) : (
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
        />
      )}
    </div>
  );
}

function ReviewStep({
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
                      className="cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
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
          {rows.length} fila(s) · precios en pesos
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
