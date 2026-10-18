"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lightbulb, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { useIsMobile } from "@/components/use-is-mobile";
import { cn } from "@/lib/utils";
import { unwrap } from "@/lib/errors";
import { normalize } from "@/lib/search";
import { alternarSaber } from "./saberes-actions";
import { EditorSaber, NOMBRE_TIPO, borradorDe, borradorNuevo, type Borrador } from "./EditorSaber";
import type { Saber, TipoSaber } from "./saberes";

const GRUPOS: { tipo: TipoSaber; titulo: string; filtro: string }[] = [
  { tipo: "juego", titulo: "Juegos de piezas", filtro: "Juegos" },
  { tipo: "sinonimo", titulo: "Sinónimos", filtro: "Sinónimos" },
  { tipo: "nota", titulo: "Notas", filtro: "Notas" },
];

function resumen(s: Saber): string {
  if (s.tipo === "juego") {
    const ob = s.piezas.filter((p) => p.obligatoria).length;
    return `${s.piezas.length} piezas · ${ob} obligatorias`;
  }
  if (s.tipo === "sinonimo") return `${s.frases.join(", ")} → ${s.nombre}`;
  return s.texto ?? "";
}

/**
 * "Lo que sabe el agente": the list on the left, the editor on the right (a
 * sheet on phones). Each switch takes effect on the agent's next message.
 */
export function SaberesView({ saberes }: { saberes: Saber[] }) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, start] = useTransition();
  const [filtro, setFiltro] = useState<TipoSaber | null>(null);
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState<Borrador | null>(() => (saberes[0] && !isMobile ? borradorDe(saberes[0]) : null));
  const [activos, setActivos] = useState(() => new Map(saberes.map((s) => [s.id, s.activo])));

  const visibles = useMemo(() => {
    const n = normalize(q);
    return saberes.filter(
      (s) => (!filtro || s.tipo === filtro) && (!n || normalize(`${s.nombre} ${s.frases.join(" ")} ${s.texto ?? ""}`).includes(n)),
    );
  }, [saberes, filtro, q]);

  function alternar(s: Saber) {
    const nuevo = !(activos.get(s.id) ?? s.activo);
    setActivos(new Map(activos).set(s.id, nuevo));
    start(async () => {
      try {
        unwrap(await alternarSaber(s.id, nuevo));
        router.refresh();
      } catch (e) {
        setActivos(new Map(activos).set(s.id, !nuevo));
        toast.error(e instanceof Error ? e.message : "No se pudo cambiar");
      }
    });
  }

  const editor = abierto && (
    <EditorSaber
      key={abierto.id ?? "nuevo"}
      inicial={abierto}
      modo="completo"
      onCancelar={() => setAbierto(null)}
      onListo={() => {
        setAbierto(null);
        router.refresh();
      }}
    />
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3.5">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand-foreground">
          <Lightbulb className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 basis-72">
          <h1 className="text-2xl font-semibold tracking-tight">Lo que sabe el agente</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Enséñale lo que sabe el mostrador: qué piezas forman un juego, cómo le dicen los clientes a cada pieza y tus reglas.
          </p>
        </div>
        <Button variant="brand" size="lg" onClick={() => setAbierto(borradorNuevo("juego"))}>
          <Plus className="h-4 w-4" />
          Enseñar algo nuevo
        </Button>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <Card className="min-w-0 flex-1 basis-80 overflow-hidden lg:max-w-sm">
          <div className="space-y-2.5 border-b border-border p-3">
            <label className="flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-muted-foreground focus-within:border-ring">
              <Search className="h-4 w-4" />
              <span className="sr-only">Buscar</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar: suspensión, balatas…"
                className="h-full w-0 min-w-0 flex-1 bg-transparent text-base text-foreground outline-hidden lg:text-sm"
              />
            </label>
            <div role="group" aria-label="Tipo" className="grid grid-cols-4 gap-0.5 rounded-lg bg-muted p-0.5">
              {[{ tipo: null, filtro: "Todo" }, ...GRUPOS].map((g) => (
                <button
                  key={g.filtro}
                  type="button"
                  aria-pressed={filtro === g.tipo}
                  onClick={() => setFiltro(g.tipo)}
                  className={cn(
                    "h-8 cursor-pointer rounded-md text-xs",
                    filtro === g.tipo ? "bg-background font-semibold shadow-sm" : "font-medium text-muted-foreground hover:text-foreground",
                  )}
                >
                  {g.filtro}
                </button>
              ))}
            </div>
          </div>
          {GRUPOS.map((g) => {
            const filas = visibles.filter((s) => s.tipo === g.tipo);
            if (!filas.length) return null;
            return (
              <div key={g.tipo}>
                <div className="px-3.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.titulo}</div>
                <ul>
                  {filas.map((s) => {
                    const activo = activos.get(s.id) ?? s.activo;
                    const sel = abierto?.id === s.id;
                    return (
                      <li key={s.id} className={cn("relative flex items-center gap-2.5 px-3.5 py-2", sel && "bg-brand-soft before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-brand")}>
                        <button type="button" onClick={() => setAbierto(borradorDe(s))} className="min-w-0 flex-1 cursor-pointer py-0.5 text-left">
                          <span className={cn("block truncate text-sm font-semibold", !activo && "text-muted-foreground")}>
                            {s.tipo === "sinonimo" ? `${s.frases[0] ?? ""} → ${s.nombre}` : s.nombre}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">{activo ? resumen(s) : "Apagado"}</span>
                        </button>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={activo}
                          aria-label={`${activo ? "Apagar" : "Prender"} ${s.nombre}`}
                          onClick={() => alternar(s)}
                          className={cn("relative h-6 w-10 shrink-0 cursor-pointer rounded-full transition-colors", activo ? "bg-brand" : "bg-muted-foreground/30")}
                        >
                          <span className={cn("absolute top-1 h-4 w-4 rounded-full bg-white transition-all", activo ? "right-1" : "left-1")} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          {!visibles.length && <p className="p-6 text-center text-sm text-muted-foreground">Nada todavía. Enséñale algo desde una conversación o con el botón de arriba.</p>}
          <div className="h-2" />
        </Card>

        {!isMobile && (
          <Card className="min-w-0 flex-[999_1_560px] p-5">
            {abierto ? (
              <>
                <div className="mb-4">
                  <div className="text-xs font-semibold text-brand-foreground">{abierto.id ? NOMBRE_TIPO[abierto.tipo] : "Nuevo"}</div>
                  <div className="text-lg font-bold">{abierto.id ? (abierto.tipo === "sinonimo" ? `${abierto.frases[0]} → ${abierto.nombre}` : abierto.nombre) : "¿Qué le vas a enseñar?"}</div>
                </div>
                {editor}
              </>
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">Elige algo de la lista para verlo o editarlo.</p>
            )}
          </Card>
        )}
      </div>

      {isMobile && (
        <Modal open={abierto !== null} onClose={() => setAbierto(null)} title={abierto?.id ? abierto.nombre : "Enseñar algo nuevo"}>
          {editor}
        </Modal>
      )}
    </div>
  );
}
