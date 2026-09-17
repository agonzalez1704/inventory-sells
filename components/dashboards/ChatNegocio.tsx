"use client";

import { useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { Send, Sparkles, Wrench } from "lucide-react";
import { GraficaChat, type DatosGrafica } from "@/components/dashboards/GraficaChat";

// Asistente del negocio (port del patron de e-commerce): lecturas directas con
// las herramientas de analytics, graficas nativas en el chat y dashboards
// generativos guardados.

const SUGERENCIAS = [
  "¿Cómo van las ventas de la semana?",
  "¿Qué producto deja más ganancia este mes?",
  "¿Cuánto hay en fiados pendientes?",
  "Hazme un dashboard de ventas del mes",
];

export function ChatNegocio() {
  const [input, setInput] = useState("");
  const finRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/asistente" }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  const ocupado = status === "submitted" || status === "streaming";

  const enviar = (texto: string) => {
    const t = texto.trim();
    if (!t || ocupado) return;
    void sendMessage({ text: t });
    setInput("");
    setTimeout(() => finRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
  };

  return (
    <div className="mx-auto flex h-[calc(100dvh-180px)] max-w-3xl flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <div className="rounded-xl border border-border bg-background p-5 shadow-card">
            <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={16} className="text-brand-strong" /> Pregúntale a tu negocio</p>
            <p className="mt-1 text-xs text-muted-foreground">Ventas, ganancia, fiados, gastos y cotizaciones — con tus datos reales. Pide gráficas o un dashboard completo.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGERENCIAS.map((s) => (
                <button key={s} onClick={() => enviar(s)} className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-brand hover:text-foreground">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
            <div className={`max-w-[85%] space-y-2 ${m.role === "user" ? "rounded-2xl bg-brand px-4 py-2.5 text-sm text-brand-foreground" : ""}`}>
              {m.parts.map((part, i) => {
                if (part.type === "text") {
                  return m.role === "user"
                    ? <span key={i}>{part.text}</span>
                    : <p key={i} className="whitespace-pre-wrap text-sm leading-relaxed">{part.text}</p>;
                }
                if (part.type === "tool-mostrarGrafica" && part.state === "output-available") {
                  return <GraficaChat key={i} datos={part.output as DatosGrafica} />;
                }
                if (part.type === "tool-crearDashboard" && part.state === "output-available") {
                  const out = part.output as { ok: boolean; url?: string; nombre?: string; error?: string };
                  return out.ok ? (
                    <a key={i} href={out.url} className="block rounded-xl border border-brand bg-brand-soft px-4 py-3 text-sm font-medium text-brand-foreground transition-colors hover:opacity-90">
                      📊 {out.nombre} — abrir dashboard →
                    </a>
                  ) : (
                    <p key={i} className="rounded-lg bg-brand-soft px-3 py-2 text-xs text-brand-foreground">No se pudo crear: {out.error}</p>
                  );
                }
                if (part.type.startsWith("tool-")) {
                  return (
                    <p key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Wrench size={11} /> {etiquetaTool(part.type)}
                    </p>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {ocupado && <p className="text-xs text-muted-foreground">Pensando…</p>}
        {error && <p className="rounded-lg bg-brand-soft px-3 py-2 text-xs text-brand-foreground">El asistente falló: {error.message}. Intenta de nuevo.</p>}
        <div ref={finRef} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); enviar(input); }}
        className="flex items-center gap-2 border-t border-border pt-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pregunta lo que sea de tu negocio…"
          className="h-12 flex-1 rounded-xl border border-border bg-background px-4 text-sm outline-hidden focus:border-brand"
        />
        <button
          disabled={ocupado || !input.trim()}
          aria-label="Enviar"
          className="grid h-12 w-12 place-items-center rounded-xl bg-brand text-brand-foreground disabled:opacity-40"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}

function etiquetaTool(tipo: string) {
  const nombres: Record<string, string> = {
    "tool-ventasResumen": "Consultando ventas",
    "tool-masVendidos": "Consultando más vendidos",
    "tool-corteCaja": "Armando el corte",
    "tool-fiadosPendientes": "Revisando fiados",
    "tool-adelantosPendientes": "Revisando adelantos",
    "tool-estadoInventario": "Revisando inventario",
    "tool-buscarProducto": "Buscando producto",
    "tool-reporteVentas": "Armando el reporte",
    "tool-mostrarGrafica": "Dibujando gráfica",
    "tool-crearDashboard": "Armando el dashboard",
  };
  return nombres[tipo] ?? "Consultando";
}
