"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/components/use-is-mobile";
import { unwrap } from "@/lib/errors";
import { proponerEnsenanza, type Propuesta } from "./saberes-actions";
import { EditorSaber, borradorNuevo } from "./EditorSaber";

/**
 * "Enseñarle" on a reply that missed: a side panel (a sheet on phones) that
 * walks the editor's steps, prefilled with the customer's message, the phrase
 * the agent did not get and the car.
 */
export function EnsenarDrawer({
  clave,
  mensajeId,
  onClose,
  onListo,
}: {
  clave: string;
  /** The agent reply being corrected. */
  mensajeId: string | null;
  onClose: () => void;
  onListo: () => void;
}) {
  const isMobile = useIsMobile();
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mensajeId) return;
    setPropuesta(null);
    setError(null);
    let vivo = true;
    (async () => {
      try {
        const r = unwrap(await proponerEnsenanza(clave, mensajeId));
        if (vivo) setPropuesta(r);
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : "No se pudo leer la conversación");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [clave, mensajeId]);

  return (
    <Drawer open={mensajeId !== null} onOpenChange={(o) => !o && onClose()} swipeDirection={isMobile ? "down" : "right"} showSwipeHandle={isMobile}>
      <DrawerContent className="data-[swipe-direction=down]:h-[92dvh] data-[swipe-direction=right]:w-[min(46rem,94vw)]">
        <DrawerHeader className="pb-3 pt-4">
          <DrawerTitle className="text-lg font-bold">Enséñale al agente</DrawerTitle>
        </DrawerHeader>
        {error ? (
          <p className="px-5 py-8 text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : !propuesta ? (
          <p className="flex items-center gap-2 px-5 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Leyendo la conversación…
          </p>
        ) : (
          <EditorSaber
            key={mensajeId}
            inicial={borradorNuevo(propuesta.tipo, propuesta.frase)}
            vehiculoInicial={propuesta.vehiculo}
            origen={{ clave, mensaje: propuesta.mensaje }}
            modo="pasos"
            onCancelar={onClose}
            onListo={onListo}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}
