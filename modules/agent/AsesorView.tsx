"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Headset, User, MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { devolverABot } from "./asesor-actions";

export type Conversacion = {
  numero: string;
  motivo: string | null;
  ultimo_texto: string | null;
  handoff_at: string | null;
};

function ago(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "hace un momento";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.floor(hrs / 24)} d`;
}

// wa.me link so the asesor can jump straight into the chat.
const waLink = (numero: string) => `https://wa.me/${numero.replace(/\D/g, "")}`;

export function AsesorView({ conversaciones }: { conversaciones: Conversacion[] }) {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Asesor</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Conversaciones que el bot pasó a una persona. Responde en WhatsApp y,
          al terminar, devuélvelas al bot.
        </p>
      </div>

      {conversaciones.length === 0 ? (
        <EmptyState
          icon={Headset}
          title="Nada pendiente"
          description="Cuando el bot necesite ayuda con un cliente, la conversación aparecerá aquí."
        />
      ) : (
        <div className="space-y-2.5">
          {conversaciones.map((c) => (
            <Row key={c.numero} c={c} />
          ))}
        </div>
      )}
    </section>
  );
}

function Row({ c }: { c: Conversacion }) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  function volver() {
    start(async () => {
      try {
        await devolverABot(c.numero);
        setDone(true);
        toast.success("Devuelto al bot");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error");
      }
    });
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-medium">
            <User className="h-4 w-4 text-muted-foreground" />
            <a
              href={waLink(c.numero)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-foreground underline-offset-2 hover:underline"
            >
              {c.numero}
            </a>
          </p>
          {c.motivo && (
            <p className="mt-1 text-sm">
              <span className="text-muted-foreground">Motivo: </span>
              {c.motivo}
            </p>
          )}
          {c.ultimo_texto && (
            <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
              <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="line-clamp-2">{c.ultimo_texto}</span>
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">{ago(c.handoff_at)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a href={waLink(c.numero)} target="_blank" rel="noopener noreferrer">
            <Button variant="accent">Abrir WhatsApp</Button>
          </a>
          <Button variant="ghost" onClick={volver} loading={pending} disabled={done}>
            Devolver al bot
          </Button>
        </div>
      </div>
    </Card>
  );
}
