"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { unwrap } from "@/lib/errors";
import { asignarEnLote, type OpcionesCatalogo } from "./actions";

const TITULO = { familia: "Poner refacción", sistema: "Poner sistema", brand: "Poner marca" } as const;

/** One field on every selected part: refacción, sistema or marca. */
export function AsignarLote({
  campo,
  skus,
  opciones,
  onClose,
  onListo,
}: {
  campo: "familia" | "sistema" | "brand";
  skus: string[];
  opciones: OpcionesCatalogo;
  onClose: () => void;
  onListo: () => void;
}) {
  const [valor, setValor] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function aplicar() {
    setGuardando(true);
    try {
      unwrap(await asignarEnLote(skus, campo, valor || null));
      toast.success(`Listo: ${skus.length} piezas`);
      onListo();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo aplicar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`${TITULO[campo]} a ${skus.length} piezas`} className="max-w-md">
      <div className="space-y-4">
        {campo === "brand" ? (
          <>
            <input
              list="lote-marcas"
              autoFocus
              value={valor}
              onChange={(e) => setValor(e.target.value.toUpperCase())}
              placeholder="YOKOMITSU"
              aria-label="Marca"
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-base outline-hidden focus:border-ring"
            />
            <datalist id="lote-marcas">{opciones.marcas.map((m) => <option key={m} value={m} />)}</datalist>
          </>
        ) : (
          <Select value={valor} onChange={(e) => setValor(e.target.value)} aria-label={TITULO[campo]}>
            <option value="">{campo === "familia" ? "Sin refacción" : "Sin sistema"}</option>
            {(campo === "familia" ? opciones.familias : opciones.sistemas).map((x) => (
              <option key={x.id} value={x.id}>{x.nombre}</option>
            ))}
          </Select>
        )}
        <Button variant="brand" className="h-11 w-full" loading={guardando} onClick={aplicar}>
          Aplicar a {skus.length} piezas
        </Button>
      </div>
    </Modal>
  );
}
