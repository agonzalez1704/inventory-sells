"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, ImageUp, Trash2, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { resizeImage } from "@/lib/image";
import { subirImagenProducto, quitarImagenProducto } from "./actions";

// Photo-only editor: no cost/stock here, so any staff member can use it
// (the full product edit form stays admin-only).
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
  const [preview, setPreview] = useState<string | null>(imagenActual);
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be picked again
    if (!file) return;

    setBusy(true);
    try {
      const small = await resizeImage(file);
      const form = new FormData();
      form.append("file", small);
      const { url } = await subirImagenProducto(productId, form);
      setPreview(url);
      toast.success("Foto actualizada");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo subir");
    } finally {
      setBusy(false);
    }
  }

  function quitar() {
    if (!confirm("¿Quitar la foto de este producto?")) return;
    start(async () => {
      try {
        await quitarImagenProducto(productId);
        setPreview(null);
        toast.success("Foto eliminada");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al quitar");
      }
    });
  }

  const working = busy || pending;

  return (
    <Modal open onClose={onClose} title="Foto del producto" className="max-w-sm">
      <div className="space-y-3">
        <p className="truncate text-sm text-muted-foreground">{nombre}</p>

        <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-border bg-white">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt={nombre}
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
              <Camera className="h-8 w-8" />
              <span className="text-xs">Sin foto</span>
            </div>
          )}
          {working && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Se muestra en la tienda pública. La foto se reduce automáticamente
          antes de subirse.
        </p>

        {/* Camera capture on phones; file picker everywhere. */}
        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onPick}
          className="hidden"
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onPick}
          className="hidden"
        />

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            onClick={() => camRef.current?.click()}
            disabled={working}
          >
            <Camera className="h-4 w-4" />
            Tomar foto
          </Button>
          <Button
            variant="secondary"
            onClick={() => fileRef.current?.click()}
            disabled={working}
          >
            <ImageUp className="h-4 w-4" />
            Subir archivo
          </Button>
        </div>

        <div className="flex justify-between gap-2 border-t border-border pt-3">
          {preview ? (
            <Button variant="ghost" onClick={quitar} disabled={working}>
              <Trash2 className="h-4 w-4" />
              Quitar foto
            </Button>
          ) : (
            <span />
          )}
          <Button variant="ghost" onClick={onClose} disabled={working}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
