"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bot, Send, User, Hand, MessageSquare, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { unwrap } from "@/lib/errors";
import {
  listarConversaciones,
  verHilo,
  tomarConversacion,
  responder,
  type ConversacionBandeja,
  type MensajeBandeja,
} from "./bandeja-actions";

// How often the open thread and the list re-read. Polling rather than a
// realtime subscription: a shop has a handful of live conversations, and this
// needs no new infrastructure to keep working.
const REFRESCO_MS = 5000;

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
const fecha = (iso: string) => {
  const d = new Date(iso);
  const hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();
  return mismoDia
    ? hora(iso)
    : d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
};

export function BandejaView({ inicial }: { inicial: ConversacionBandeja[] }) {
  const [convs, setConvs] = useState(inicial);
  const [sel, setSel] = useState<string | null>(inicial[0]?.clave ?? null);
  const [hilo, setHilo] = useState<MensajeBandeja[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  const actual = convs.find((c) => c.clave === sel) ?? null;

  const refrescar = useCallback(async () => {
    try {
      const [lista, mensajes] = await Promise.all([
        listarConversaciones(),
        sel ? verHilo(sel) : Promise.resolve([]),
      ]);
      setConvs(lista);
      if (sel) setHilo(mensajes);
    } catch {
      /* a failed poll is not worth a toast; the next one will land */
    }
  }, [sel]);

  useEffect(() => {
    refrescar();
    const t = setInterval(refrescar, REFRESCO_MS);
    return () => clearInterval(t);
  }, [refrescar]);

  // Follow the conversation as it grows, the way a chat should.
  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [hilo.length]);

  async function alternarControl() {
    if (!actual) return;
    const tomar = actual.estado === "bot";
    try {
      unwrap(await tomarConversacion(actual.clave, tomar));
      toast.success(tomar ? "Tomaste la conversación" : "Devuelta al bot");
      refrescar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  }

  async function enviar() {
    if (!actual || !texto.trim()) return;
    setEnviando(true);
    const cuerpo = texto.trim();
    setTexto("");
    try {
      unwrap(await responder(actual.clave, cuerpo));
      await refrescar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo enviar");
      setTexto(cuerpo); // don't lose what they wrote
    } finally {
      setEnviando(false);
    }
  }

  if (convs.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="Sin conversaciones"
        description="Aquí aparecen los chats de WhatsApp en cuanto alguien escriba."
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Lista */}
      <Card className="overflow-hidden lg:col-span-1">
        <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
          {convs.map((c) => (
            <li key={c.clave}>
              <button
                onClick={() => setSel(c.clave)}
                className={cn(
                  "relative w-full cursor-pointer py-3 pl-4 pr-4 text-left transition-colors duration-150 hover:bg-muted/60",
                  // A left rail marks the selection: a background alone reads as
                  // hover, and on a long list you lose your place.
                  sel === c.clave &&
                    "bg-muted before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-accent",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {c.cliente_nombre ?? c.telefono ?? (c.username ? `@${c.username}` : c.clave)}
                  </span>
                  {c.estado === "asesor" && <Badge tone="warning">Asesor</Badge>}
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {fecha(c.ultimo_at)}
                  </span>
                </div>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  {c.ultimo_rol === "assistant" && <Bot className="h-3 w-3 shrink-0 text-accent" />}
                  {c.ultimo_rol === "asesor" && <Hand className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{c.ultimo_texto}</span>
                </p>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {/* Hilo */}
      <Card className="flex max-h-[70vh] flex-col overflow-hidden lg:col-span-2">
        {actual && (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {actual.cliente_nombre ?? actual.telefono ?? actual.clave}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      actual.estado === "asesor" ? "bg-amber-500" : "bg-accent",
                    )}
                  />
                  {actual.estado === "asesor" ? (
                    <span className="text-amber-700 dark:text-amber-400">
                      Bot en pausa · {actual.motivo ?? "tomada por un asesor"}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">El bot está contestando</span>
                  )}
                </p>
              </div>
              <Button
                variant={actual.estado === "asesor" ? "secondary" : "accent"}
                size="sm"
                onClick={alternarControl}
              >
                {actual.estado === "asesor" ? (
                  <>
                    <Bot className="h-4 w-4" />
                    Devolver al bot
                  </>
                ) : (
                  <>
                    <Hand className="h-4 w-4" />
                    Tomar control
                  </>
                )}
              </Button>
            </div>

            <div className="flex-1 space-y-2.5 overflow-y-auto bg-page p-4">
              {hilo.map((m) => (
                <Burbuja key={m.id} m={m} />
              ))}
              <div ref={finRef} />
            </div>

            <div className="space-y-1.5 border-t border-border p-3">
              <div className="flex gap-2">
                <Input
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      enviar();
                    }
                  }}
                  placeholder="Escribe y el bot queda en pausa…"
                  disabled={enviando}
                />
                <Button onClick={enviar} loading={enviando} disabled={!texto.trim()}>
                  {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              {actual.estado === "bot" && (
                <p className="text-[11px] text-muted-foreground">
                  Al enviar tomas el control: si no, el bot seguiría contestando encima de ti.
                </p>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// Three voices, three FILLS — not three pale tints.
//
// The first version used bg-muted (96% lightness), accent-soft (96%) and
// brand-soft (95%) on a 100% white card: the same near-white three times over,
// separated only by hue. Who said what is the entire reason this screen exists,
// so the difference has to survive a glance on a shop phone in daylight.
//
// The thread sits on a tinted canvas so the customer's white bubble reads as an
// object on it, and the two outgoing voices carry saturated fills.
const VOZ = {
  user: {
    etiqueta: "Cliente",
    Icono: User,
    burbuja: "bg-background border border-border text-foreground rounded-bl-md",
    meta: "text-muted-foreground",
  },
  assistant: {
    etiqueta: "Agente",
    Icono: Bot,
    // emerald-700, not the --accent token (emerald-600). White on 600 measures
    // 3.77:1, under the 4.5:1 floor for body text; 700 gives 5.48:1. The token
    // stays as it is — it is a system colour for money and availability, and
    // narrowing it to satisfy this one surface would be the wrong trade.
    // Dark mode inverts: a light fill with near-black text, 7.75:1.
    burbuja:
      "bg-emerald-700 text-white dark:bg-emerald-400 dark:text-emerald-950 rounded-br-md",
    meta: "text-white/75 dark:text-emerald-950/70",
  },
  asesor: {
    etiqueta: "Asesor",
    Icono: Hand,
    burbuja: "bg-primary text-primary-foreground rounded-br-md",
    meta: "text-primary-foreground/75",
  },
} as const;

function Burbuja({ m }: { m: MensajeBandeja }) {
  const delCliente = m.rol === "user";
  const v = VOZ[m.rol] ?? VOZ.assistant;
  const { Icono } = v;
  return (
    <div className={cn("flex", delCliente ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
          v.burbuja,
        )}
      >
        <p className="whitespace-pre-wrap break-words leading-relaxed">{m.contenido}</p>
        <p className={cn("mt-1 flex items-center gap-1 text-[10px]", v.meta)}>
          <Icono className="h-3 w-3" />
          {v.etiqueta} · {hora(m.created_at)}
        </p>
      </div>
    </div>
  );
}
