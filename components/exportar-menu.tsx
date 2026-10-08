"use client";

import { useEffect, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { ChevronDown, Download } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { exportarPdf, exportarXlsx, type ColumnaExport } from "@/lib/exportar-tabla";

type Formato = "pdf" | "xlsx";

/**
 * "Exportar" as one button that opens a small menu: format, columns, download.
 *
 * Closed, it costs the screen nothing — the table stays what the panel is
 * about. The column choice and the format are remembered per browser under
 * `recordar`, because whoever exports a report wants the same file each time.
 */
export function ExportarMenu<T>({
  columnas,
  filas,
  archivo,
  titulo,
  subtitulo,
  hoja,
  recordar,
}: {
  columnas: ColumnaExport<T>[];
  filas: T[];
  /** File name without extension. */
  archivo: string;
  titulo: string;
  subtitulo: string;
  /** Excel sheet name. */
  hoja: string;
  /** localStorage key for the remembered choice. */
  recordar: string;
}) {
  const [elegidas, setElegidas] = useState<string[] | null>(null);
  const [formato, setFormato] = useState<Formato>("pdf");
  const [bajando, setBajando] = useState(false);

  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(recordar) ?? "null") as { columnas?: string[]; formato?: Formato } | null;
      if (v?.columnas) setElegidas(v.columnas);
      if (v?.formato === "pdf" || v?.formato === "xlsx") setFormato(v.formato);
    } catch {
      // Blocked storage: every column, PDF, as on first use.
    }
  }, [recordar]);

  const activas = new Set(elegidas ?? columnas.map((c) => c.id));
  const seleccion = columnas.filter((c) => activas.has(c.id));

  function guardar(cols: string[], f: Formato) {
    try {
      localStorage.setItem(recordar, JSON.stringify({ columnas: cols, formato: f }));
    } catch {
      // Not remembered; still applies now.
    }
  }

  function poner(ids: string[]) {
    // The table's order, whatever order they were clicked in.
    const orden = columnas.map((c) => c.id).filter((id) => ids.includes(id));
    setElegidas(orden);
    guardar(orden, formato);
  }

  function elegirFormato(f: Formato) {
    setFormato(f);
    guardar(seleccion.map((c) => c.id), f);
  }

  async function descargar() {
    if (!seleccion.length) return;
    setBajando(true);
    try {
      if (formato === "pdf") await exportarPdf({ archivo, titulo, subtitulo, columnas: seleccion, filas });
      else await exportarXlsx({ archivo, hoja, columnas: seleccion, filas });
    } catch {
      toast.error("No se pudo generar el archivo");
    } finally {
      setBajando(false);
    }
  }

  return (
    <Popover.Root>
      <Popover.Trigger
        className={cn(
          "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium",
          "hover:bg-muted data-[popup-open]:bg-muted",
        )}
      >
        <Download className="h-3.5 w-3.5" />
        Exportar
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </Popover.Trigger>
      <Popover.Portal>
        {/* Above the modal (z-50) it opens from. */}
        <Popover.Positioner side="bottom" align="end" sideOffset={6} collisionPadding={12} className="z-[60]">
          <Popover.Popup className="w-72 space-y-3.5 rounded-xl border border-border bg-background p-3.5 shadow-pop outline-none">
            <div>
              <Popover.Title className="text-sm font-semibold">Exportar</Popover.Title>
              <Popover.Description className="mt-0.5 text-xs text-muted-foreground">{subtitulo}</Popover.Description>
            </div>

            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-0.5" role="group" aria-label="Formato">
              {(
                [
                  ["pdf", "PDF"],
                  ["xlsx", "Excel"],
                ] as const
              ).map(([f, label]) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={formato === f}
                  onClick={() => elegirFormato(f)}
                  className={cn(
                    "h-8 cursor-pointer rounded-md text-sm",
                    formato === f
                      ? "bg-background font-semibold text-foreground shadow-sm"
                      : "font-medium text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <p className="text-xs font-medium text-muted-foreground">Columnas</p>
                <div className="flex gap-3 text-xs">
                  <button type="button" className="cursor-pointer font-medium hover:underline" onClick={() => poner(columnas.map((c) => c.id))}>
                    Todas
                  </button>
                  <button type="button" className="cursor-pointer text-muted-foreground hover:underline" onClick={() => poner([])}>
                    Ninguna
                  </button>
                </div>
              </div>
              <div className="mt-1.5">
                {columnas.map((c) => {
                  const on = activas.has(c.id);
                  return (
                    <label
                      key={c.id}
                      className={cn(
                        "flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-sm hover:bg-muted",
                        !on && "text-muted-foreground",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => poner(on ? [...activas].filter((x) => x !== c.id) : [...activas, c.id])}
                        className="h-4 w-4 accent-primary"
                      />
                      {c.titulo}
                      {c.nota && (
                        <span className="ml-auto rounded-full bg-muted px-1.5 py-px text-[11px] text-muted-foreground">
                          {c.nota}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={descargar}
              disabled={!seleccion.length || bajando}
              className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {bajando
                ? "Generando…"
                : seleccion.length
                  ? `Descargar ${formato === "pdf" ? "PDF" : "Excel"} · ${seleccion.length} ${seleccion.length === 1 ? "columna" : "columnas"}`
                  : "Elige al menos una columna"}
            </button>
            <p className="-mt-1.5 text-center text-[11px] text-muted-foreground">Se recuerda tu selección en este equipo.</p>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
