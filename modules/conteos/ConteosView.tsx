"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardList, ChevronRight, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { unwrap } from "@/lib/errors";
import { iniciarConteo, type ConteoResumen } from "./actions";

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const ESTADO: Record<ConteoResumen["estado"], { label: string; tone: "accent" | "neutral" | "success" }> = {
  abierto: { label: "En curso", tone: "accent" },
  cerrado: { label: "Cerrado", tone: "neutral" },
  aplicado: { label: "Aplicado", tone: "success" },
};

export function ConteosView({
  inventarios,
  conteos,
  puedeAbrir,
}: {
  inventarios: { id: string; name: string }[];
  conteos: ConteoResumen[];
  puedeAbrir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [inventario, setInventario] = useState(inventarios[0]?.id ?? "");
  const [nombre, setNombre] = useState("");
  const [motivo, setMotivo] = useState("");

  function abrir() {
    if (!nombre.trim()) return toast.error("Ponle nombre al conteo");
    start(async () => {
      try {
        const id = unwrap(await iniciarConteo(inventario, nombre.trim(), motivo.trim() || null));
        router.push(`/conteos/${id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo abrir el conteo");
      }
    });
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conteos físicos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cuenta un inventario completo y compáralo con el sistema, pieza por
          pieza. Cada cantidad se guarda al momento; al cerrar sale el reporte
          de diferencias valuado.
        </p>
      </div>

      {puedeAbrir && (
        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">Nuevo conteo</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Inventario</span>
              <Select value={inventario} onChange={(e) => setInventario(e.target.value)}>
                {inventarios.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Nombre</span>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Conteo Centro nov 2026" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Motivo (opcional)</span>
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Sustracción del 25/11" />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Toma la foto del sistema al abrir. Si el inventario ya tiene un conteo en curso, sigue ese.
          </p>
          <div className="flex justify-end">
            <Button onClick={abrir} loading={pending} disabled={!inventario}>
              <Plus className="h-4 w-4" />
              Abrir conteo
            </Button>
          </div>
        </Card>
      )}

      <div>
        <h2 className="text-sm font-semibold">Conteos</h2>
        {conteos.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Sin conteos todavía"
            description="Abre uno para empezar a contar un inventario."
          />
        ) : (
          <ul className="mt-2 space-y-2">
            {conteos.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/conteos/${c.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <span className="truncate">{c.nombre}</span>
                      <Badge tone={ESTADO[c.estado].tone}>{ESTADO[c.estado].label}</Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.inventario} · {c.contados}/{c.total} contados · {fecha(c.created_at)}
                      {c.autor ? ` · ${c.autor}` : ""}
                      {c.motivo ? ` · ${c.motivo}` : ""}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
