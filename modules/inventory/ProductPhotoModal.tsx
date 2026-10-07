"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, ImageUp, Loader2, Plus, Star, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/use-confirm";
import { cn } from "@/lib/utils";
import { resizeImage } from "@/lib/image";
import {
  agregarFotoProducto,
  fotosProducto,
  hacerFotoPrincipal,
  quitarFotoExtra,
  quitarImagenProducto,
  type FotosProducto,
} from "./actions";

const MAX_FOTOS = 8;

type Foto = { id: string | null; url: string };

// Photo-only editor: no cost/stock here, so any staff member can use it
// (the full product edit form stays admin-only).
//
// Several photos per product: the first is the main one — the card, the row
// and the cart read it — and the rest are the gallery the store and the
// product panel show.
export function ProductPhotoModal({
  productId,
  nombre,
  imagenActual,
  onClose,
}: {
  productId: string;
  nombre: string;
  imagenActual: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [fotos, setFotos] = useState<FotosProducto>({ principal: imagenActual, extras: [] });
  const [sel, setSel] = useState(0);
  const [subiendo, setSubiendo] = useState<{ n: number; de: number } | null>(null);
  const [pending, start] = useTransition();
  const [confirmar, dialogoConfirm] = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    setFotos(await fotosProducto(productId));
  }, [productId]);

  useEffect(() => {
    cargar().catch(() => {});
  }, [cargar]);

  const lista: Foto[] = [
    ...(fotos.principal ? [{ id: null, url: fotos.principal }] : []),
    ...fotos.extras,
  ];
  const actual = lista[Math.min(sel, Math.max(0, lista.length - 1))] ?? null;
  const caben = MAX_FOTOS - lista.length;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // let the same file be picked again
    if (!files.length) return;
    if (files.length > caben) toast.info(`Solo caben ${caben} más; subo las primeras ${caben}.`);
    const tanda = files.slice(0, Math.max(0, caben));

    let ok = 0;
    for (let i = 0; i < tanda.length; i++) {
      setSubiendo({ n: i + 1, de: tanda.length });
      try {
        const form = new FormData();
        form.append("file", await resizeImage(tanda[i]));
        const res = await agregarFotoProducto(productId, form);
        if (!res.ok) {
          toast.error(res.error);
          break;
        }
        ok++;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo subir");
        break;
      }
    }
    setSubiendo(null);
    await cargar();
    if (ok) {
      setSel(lista.length + ok - 1);
      toast.success(ok === 1 ? "Foto agregada" : `${ok} fotos agregadas`);
      router.refresh();
    }
  }

  async function quitar() {
    if (!actual) return;
    if (!(await confirmar({ title: "¿Quitar esta foto?", confirmLabel: "Quitar", tone: "danger" }))) return;
    const extraId = actual.id;
    start(async () => {
      const res = extraId ? await quitarFotoExtra(extraId) : await quitarImagenProducto(productId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      await cargar();
      setSel((s) => Math.max(0, s - 1));
      toast.success("Foto eliminada");
      router.refresh();
    });
  }

  function principal() {
    if (!actual?.id) return;
    const id = actual.id;
    start(async () => {
      const res = await hacerFotoPrincipal(productId, id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      await cargar();
      setSel(0);
      toast.success("Ahora es la foto principal");
      router.refresh();
    });
  }

  const working = !!subiendo || pending;

  return (
    <Modal open onClose={onClose} title="Fotos del producto" className="max-w-md">
      {dialogoConfirm}
      <div className="space-y-3">
        <p className="truncate text-sm text-muted-foreground">{nombre}</p>

        <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-border bg-background">
          {actual ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={actual.url} alt={nombre} className="h-full w-full object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
              <Camera className="h-8 w-8" />
              <span className="text-xs">Sin fotos</span>
            </div>
          )}
          {actual && actual.id === null && (
            <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-brand-foreground">
              <Star className="h-3 w-3" />
              Principal
            </span>
          )}
          {working && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              {subiendo && subiendo.de > 1 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  Subiendo {subiendo.n} de {subiendo.de}…
                </span>
              )}
            </div>
          )}
        </div>

        {lista.length > 0 && (
          <div className="grid grid-cols-5 gap-2">
            {lista.map((f, k) => (
              <button
                key={f.id ?? "principal"}
                type="button"
                onClick={() => setSel(k)}
                aria-label={k === 0 && f.id === null ? "Foto principal" : `Foto ${k + 1}`}
                aria-pressed={k === sel}
                className={cn(
                  "relative aspect-square cursor-pointer overflow-hidden rounded-lg border bg-background",
                  k === sel ? "border-primary ring-2 ring-primary/30" : "border-border",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt="" className="h-full w-full object-cover" />
                {f.id === null && (
                  <Star className="absolute top-1 left-1 h-3.5 w-3.5 fill-brand text-brand drop-shadow" />
                )}
              </button>
            ))}
            {caben > 0 && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={working}
                aria-label="Agregar fotos"
                className="flex aspect-square cursor-pointer items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                <Plus className="h-5 w-5" />
              </button>
            )}
          </div>
        )}

        {actual && (
          <div className="flex flex-wrap gap-2">
            {actual.id && (
              <Button variant="secondary" size="sm" onClick={principal} disabled={working}>
                <Star className="h-4 w-4" />
                Hacer principal
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={quitar} disabled={working}>
              <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
              Quitar esta foto
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          La principal sale en el punto de venta y en la tienda; las demás, en la galería de la tienda. Hasta{" "}
          {MAX_FOTOS} fotos; se reducen solas antes de subirse.{" "}
          <span className="tabular-nums">
            {lista.length} de {MAX_FOTOS}.
          </span>
        </p>

        {/* Camera capture on phones; several files at once everywhere. */}
        <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={onPick} className="hidden" />
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={onPick}
          className="hidden"
        />

        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => camRef.current?.click()} disabled={working || caben <= 0}>
            <Camera className="h-4 w-4" />
            Tomar foto
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={working || caben <= 0}>
            <ImageUp className="h-4 w-4" />
            Subir fotos
          </Button>
        </div>

        <div className="flex justify-end border-t border-border pt-3">
          <Button variant="ghost" onClick={onClose} disabled={working}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
