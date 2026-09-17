"use client";

import { useEffect, useRef, useState } from "react";
import { Flashlight, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorCtor = {
  new (o: { formats: string[] }): Detector;
  getSupportedFormats: () => Promise<string[]>;
};

/**
 * Full-screen camera that reads a QR label. Uses the browser's own
 * BarcodeDetector where it exists (Chrome, Android) and falls back to jsQR,
 * loaded only when needed (Safari / iPhone).
 */
export function EscanerQR({ onCodigo, onClose }: { onCodigo: (texto: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [linterna, setLinterna] = useState<null | boolean>(null); // null = not supported
  const track = useRef<MediaStreamTrack | null>(null);
  // Latest callback without restarting the camera when the parent re-renders.
  const alLeer = useRef(onCodigo);
  alLeer.current = onCodigo;

  useEffect(() => {
    let vivo = true;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const lienzo = document.createElement("canvas");

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch (e) {
        const nombre = e instanceof DOMException ? e.name : "";
        setError(
          nombre === "NotAllowedError"
            ? "Sin permiso para usar la cámara. Actívalo en los ajustes del navegador para este sitio."
            : nombre === "NotFoundError"
              ? "Este dispositivo no tiene cámara."
              : "No se pudo abrir la cámara.",
        );
        return;
      }
      if (!vivo || !video.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.current.srcObject = stream;
      await video.current.play().catch(() => {});
      track.current = stream.getVideoTracks()[0] ?? null;
      const caps = track.current?.getCapabilities?.() as { torch?: boolean } | undefined;
      if (caps?.torch) setLinterna(false);

      let detector: Detector | null = null;
      const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      if (Ctor && (await Ctor.getSupportedFormats().catch((): string[] => [])).includes("qr_code")) {
        detector = new Ctor({ formats: ["qr_code"] });
      }
      const jsQR = detector ? null : (await import("jsqr")).default;

      const leer = async () => {
        if (!vivo) return;
        const v = video.current;
        let texto: string | null = null;
        if (v && v.readyState >= 2 && v.videoWidth > 0) {
          try {
            if (detector) {
              texto = (await detector.detect(v))[0]?.rawValue ?? null;
            } else if (jsQR) {
              const escala = Math.min(1, 720 / v.videoWidth);
              lienzo.width = Math.round(v.videoWidth * escala);
              lienzo.height = Math.round(v.videoHeight * escala);
              const ctx = lienzo.getContext("2d", { willReadFrequently: true });
              if (ctx) {
                ctx.drawImage(v, 0, 0, lienzo.width, lienzo.height);
                const img = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
                texto = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
              }
            }
          } catch {
            // A frame that fails to decode is just the next frame's problem.
          }
        }
        if (texto && vivo) {
          navigator.vibrate?.(60);
          alLeer.current(texto);
          return;
        }
        timer = setTimeout(leer, 150);
      };
      leer();
    })();

    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", tecla);
    return () => {
      vivo = false;
      clearTimeout(timer);
      window.removeEventListener("keydown", tecla);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onClose]);

  async function alternarLinterna() {
    if (!track.current || linterna === null) return;
    const on = !linterna;
    try {
      await track.current.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      setLinterna(on);
    } catch {
      setLinterna(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black text-white" role="dialog" aria-modal="true" aria-label="Escanear QR">
      <video ref={video} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-x-0 top-0 flex h-16 items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-2 pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar escáner"
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full hover:bg-white/10"
        >
          <X className="h-6 w-6" />
        </button>
        <span className="text-base font-semibold">Escanear QR</span>
        {linterna !== null ? (
          <button
            type="button"
            onClick={alternarLinterna}
            aria-pressed={linterna}
            aria-label="Linterna"
            className={cn(
              "flex h-11 w-11 cursor-pointer items-center justify-center rounded-full",
              linterna ? "bg-white text-black" : "hover:bg-white/10",
            )}
          >
            <Flashlight className="h-5 w-5" />
          </button>
        ) : (
          <span className="w-11" />
        )}
      </div>

      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="max-w-xs text-base">{error}</p>
          <button
            type="button"
            onClick={onClose}
            className="h-11 cursor-pointer rounded-full bg-white px-6 text-sm font-semibold text-black"
          >
            Cerrar
          </button>
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-6">
          <div className="relative h-64 w-64">
            {[
              "left-0 top-0 rounded-tl-2xl border-l-4 border-t-4",
              "right-0 top-0 rounded-tr-2xl border-r-4 border-t-4",
              "bottom-0 left-0 rounded-bl-2xl border-b-4 border-l-4",
              "bottom-0 right-0 rounded-br-2xl border-b-4 border-r-4",
            ].map((c) => (
              <span key={c} className={cn("absolute h-11 w-11 border-amber-400", c)} />
            ))}
          </div>
          <p className="rounded-full bg-black/50 px-4 py-1.5 text-sm">Apunta al código QR de la etiqueta</p>
        </div>
      )}
    </div>
  );
}
