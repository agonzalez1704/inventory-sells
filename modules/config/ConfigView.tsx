"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateNegocioInfo } from "./negocio";

const PLACEHOLDER = `Ejemplo:
- Envíos: sí, a domicilio por mensajería (costo según zona). También mandamos Uber/DiDi por cuenta del cliente.
- Pagos: efectivo, tarjeta y transferencia.
- Transferencia: BBVA, CLABE 0123456789012345 67, a nombre de Juan Pérez.
- Ubicación: Local 87, Plaza Centro. Horario L-S 10:00-19:00.
- Garantía: 30 días en pantallas.`;

export function ConfigView({
  info,
  asesores,
  isAdmin,
}: {
  info: string;
  asesores: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(info);
  const [nums, setNums] = useState(asesores);
  const [pending, start] = useTransition();

  const dirty = text !== info || nums !== asesores;

  function save() {
    start(async () => {
      try {
        await updateNegocioInfo(text, nums);
        toast.success("Guardado");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al guardar");
      }
    });
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Información del negocio que el asistente de WhatsApp usa para responder
          (envíos, pagos, transferencia, ubicación, horario, garantías…).
        </p>
      </div>

      <Card className="p-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            Información del negocio
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!isAdmin || pending}
            rows={14}
            placeholder={PLACEHOLDER}
            className="w-full rounded-lg border border-border bg-background p-3 text-sm leading-relaxed focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/10 disabled:opacity-70"
          />
        </label>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium">
            Números de asesor (WhatsApp)
          </span>
          <Input
            value={nums}
            onChange={(e) => setNums(e.target.value)}
            disabled={!isAdmin || pending}
            placeholder="5215512345678, 5215598765432"
          />
          <span className="mt-1.5 block text-xs text-muted-foreground">
            Cuando el bot no pueda resolver algo, avisará a estos números con lada
            del país (México = 52). Sepáralos con coma. El aviso por WhatsApp solo
            llega si el asesor escribió al número del negocio en las últimas 24 h;
            la conversación siempre queda en la bandeja{" "}
            <span className="font-medium">Asesor</span>.
          </span>
        </label>

        {isAdmin ? (
          <div className="mt-4 flex justify-end">
            <Button onClick={save} loading={pending} disabled={!dirty}>
              Guardar
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Solo administradores pueden editar.
          </p>
        )}
      </Card>
    </section>
  );
}
