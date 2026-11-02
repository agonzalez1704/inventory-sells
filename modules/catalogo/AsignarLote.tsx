"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { ComboSelect } from "@/components/ui/combo-select";
import { unwrap } from "@/lib/errors";
import { asignarEnLote, crearFamilia, type OpcionesCatalogo } from "./actions";

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
          <ComboSelect
            aria-label="Marca"
            valor={valor}
            onChange={setValor}
            placeholder="YOKOMITSU"
            opciones={opciones.marcas.map((m) => ({ value: m, label: m }))}
            onCrear={async (t) => ({ value: t.toUpperCase(), label: t.toUpperCase() })}
          />
        ) : (
          <ComboSelect
            aria-label={TITULO[campo]}
            valor={valor}
            onChange={setValor}
            vacio={campo === "familia" ? "Sin refacción" : "Sin sistema"}
            opciones={(campo === "familia" ? opciones.familias : opciones.sistemas).map((x) => ({ value: x.id, label: x.nombre }))}
            onCrear={
              campo === "familia"
                ? async (t) => {
                    try {
                      const f = unwrap(await crearFamilia(t, null));
                      return { value: f.id, label: f.nombre };
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "No se pudo crear");
                      return null;
                    }
                  }
                : undefined
            }
          />
        )}
        <Button variant="brand" className="h-11 w-full" loading={guardando} onClick={aplicar}>
          Aplicar a {skus.length} piezas
        </Button>
      </div>
    </Modal>
  );
}
