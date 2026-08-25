"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { X, Plus, Tags } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  tagsDeProducto,
  sugerirTags,
  etiquetarProducto,
  desetiquetarProducto,
  type Tag,
} from "./actions";

/**
 * Compatibility-tag chips for one product: type to get existing tags suggested
 * (names must converge or groups silently split), Enter/+ to attach, × to
 * detach. Saves instantly — tagging is its own act, not part of the form's
 * Guardar, so a half-edited price never holds a finished tag hostage.
 */
export function TagsEditor({ productId }: { productId: string }) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [texto, setTexto] = useState("");
  const [sugeridas, setSugeridas] = useState<Tag[]>([]);
  const [guardando, setGuardando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let on = true;
    tagsDeProducto(productId)
      .then((t) => on && setTags(t))
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [productId]);

  // Debounced autocomplete — the point is reusing existing names.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const frag = texto.trim();
    if (frag.length < 2) return setSugeridas([]);
    timer.current = setTimeout(() => {
      sugerirTags(frag)
        .then((s) => setSugeridas(s.filter((x) => !tags.some((t) => t.id === x.id))))
        .catch(() => {});
    }, 200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [texto, tags]);

  async function agregar(nombre: string) {
    const limpio = nombre.trim();
    if (!limpio || guardando) return;
    setGuardando(true);
    try {
      const tag = await etiquetarProducto(productId, limpio);
      setTags((p) => (p.some((t) => t.id === tag.id) ? p : [...p, tag]));
      setTexto("");
      setSugeridas([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo etiquetar");
    } finally {
      setGuardando(false);
    }
  }

  async function quitar(tag: Tag) {
    setTags((p) => p.filter((t) => t.id !== tag.id)); // optimistic
    try {
      await desetiquetarProducto(productId, tag.id);
    } catch (e) {
      setTags((p) => [...p, tag]);
      toast.error(e instanceof Error ? e.message : "No se pudo quitar");
    }
  }

  return (
    <div>
      <span className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Tags className="h-3.5 w-3.5" />
        Compatibilidad
      </span>
      {tags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 rounded-full bg-sky-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-600/20 dark:bg-sky-950/40 dark:text-sky-300"
            >
              {t.nombre}
              <button
                type="button"
                onClick={() => quitar(t)}
                aria-label={`Quitar ${t.nombre}`}
                className="cursor-pointer rounded-full p-0.5 hover:bg-sky-100 dark:hover:bg-sky-900"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <div className="flex gap-2">
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                agregar(texto);
              }
            }}
            placeholder="Tsuru 1992-1997, Sentra B13…"
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => agregar(texto)}
            disabled={!texto.trim() || guardando}
            aria-label="Agregar etiqueta"
            className={cn(
              "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border transition-colors hover:border-ring/40",
              (!texto.trim() || guardando) && "cursor-default opacity-40",
            )}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {sugeridas.length > 0 && (
          <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-border bg-background shadow-md">
            {sugeridas.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => agregar(s.nombre)}
                className="block w-full cursor-pointer px-3 py-1.5 text-left text-sm hover:bg-muted"
              >
                {s.nombre}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Los productos que comparten etiqueta aparecen como compatibles.
      </p>
    </div>
  );
}
