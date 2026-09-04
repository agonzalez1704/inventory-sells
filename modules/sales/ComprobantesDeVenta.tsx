"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Receipt, ExternalLink, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AdjuntarImagen } from "@/components/ui/adjuntar-imagen";
import { CuentaChip, CuentaPicker, useCuentas } from "@/components/ui/cuenta";
import { comprobantesDeVenta, guardarComprobante, type Comprobante } from "./comprobantes";

/**
 * A sale's transfer proofs, fetched when the row expands — plus the way to add
 * one AFTER the fact: the customer often sends the screenshot by WhatsApp
 * minutes after the charge, so editing the sale must accept it (paste or file).
 */
export function ComprobantesDeVenta({ saleId }: { saleId: string }) {
  const [rows, setRows] = useState<Comprobante[]>([]);
  const [agregando, setAgregando] = useState(false);
  const [referencia, setReferencia] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [cuentaId, setCuentaId] = useState<string | null>(null);
  const cuentas = useCuentas();
  const [pending, start] = useTransition();

  function cargar() {
    comprobantesDeVenta(saleId).then(setRows).catch(() => {});
  }
  useEffect(() => {
    let on = true;
    comprobantesDeVenta(saleId)
      .then((r) => on && setRows(r))
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [saleId]);

  function guardar() {
    if (!referencia.trim() && !foto && !cuentaId)
      return toast.error("Pega la captura, escribe la referencia o elige la cuenta");
    start(async () => {
      let form: FormData | undefined;
      if (foto) {
        form = new FormData();
        form.append("file", foto);
      }
      const r = await guardarComprobante(saleId, referencia.trim() || null, form, cuentaId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Comprobante guardado");
      setReferencia("");
      setFoto(null);
      setCuentaId(null);
      setAgregando(false);
      cargar();
    });
  }

  return (
    <div
      className="mt-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <Receipt className="h-3.5 w-3.5" />
          Comprobante{rows.length > 1 ? "s" : ""} de pago
        </p>
        {!agregando && (
          <button
            type="button"
            onClick={() => setAgregando(true)}
            className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-brand-foreground hover:underline"
          >
            <Plus className="h-3 w-3" />
            Agregar
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {rows.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 text-xs">
              {c.cuenta && <CuentaChip cuenta={c.cuenta} />}
              {c.referencia && <span className="font-mono">{c.referencia}</span>}
              {c.imagen_url && (
                <a
                  href={c.imagen_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-brand-foreground hover:underline"
                >
                  Ver captura <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <span className="text-muted-foreground">
                {new Date(c.created_at).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {rows.length === 0 && !agregando && (
        <p className="mt-1 text-xs text-muted-foreground">Sin comprobante capturado.</p>
      )}

      {agregando && (
        <div className="mt-2 space-y-2">
          <Input
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder="Referencia / clave de rastreo"
            className="h-9"
          />
          <AdjuntarImagen value={foto} onChange={setFoto} />
          <CuentaPicker cuentas={cuentas} value={cuentaId} onChange={setCuentaId} />
          <div className="flex gap-2">
            <Button size="sm" onClick={guardar} loading={pending}>
              Guardar comprobante
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAgregando(false)} disabled={pending}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
