"use client";

import { Input } from "@/components/ui/input";
import { ahoraMx, opcionesEntrega, type Expres, type RutaDia } from "@/modules/agent/reparto";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
// The day before, skipping Sunday: Monday's truck closes on Saturday.
const diaAnterior = (d: number) => (d === 1 ? 6 : d - 1);

const campo =
  "h-10 rounded-lg border border-border bg-background px-2.5 text-sm outline-hidden focus:ring-2 focus:ring-ring/20";

/**
 * How pieces from this almacén reach a WhatsApp customer, who picks: the route
 * truck on its days (free, each day with its own order cutoff), or exprés
 * (sooner, for a fee per quote). The preview says what the agent would offer now.
 */
export function RutaExpres({
  nombre,
  ruta,
  setRuta,
  expres,
  setExpres,
}: {
  nombre: string;
  ruta: RutaDia[];
  setRuta: (r: RutaDia[]) => void;
  expres: Expres;
  setExpres: (e: Expres) => void;
}) {
  const de = (d: number) => ruta.find((r) => r.llega === d);
  const cambia = (d: number, patch: Partial<RutaDia>) =>
    setRuta(ruta.map((r) => (r.llega === d ? { ...r, ...patch } : r)));
  const alterna = (d: number) =>
    setRuta(
      de(d)
        ? ruta.filter((r) => r.llega !== d)
        : [...ruta, { llega: d, corte_dia: diaAnterior(d), corte: "16:00" }].sort((a, b) => a.llega - b.llega),
    );

  const ops = opcionesEntrega(
    {
      product_id: "", nombre: "", almacen: nombre, existencia: 1, precio_mxn: 1, entrega_dias: null, imagen: null,
      es_mostrador: false, ruta: ruta.length ? ruta : null, expres,
    },
    ahoraMx(),
  );

  return (
    <div className="space-y-3">
      <fieldset className="space-y-2 rounded-lg border border-border p-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Ruta (sin costo)</legend>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_88px] items-center gap-x-2 gap-y-1.5 text-sm">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Llega</span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pedir antes del</span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Hora</span>
          {DIAS.map((nom, i) => {
            const d = i + 1;
            const r = de(d);
            return (
              <div key={d} className="contents">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!r}
                    onChange={() => alterna(d)}
                    className="h-4 w-4 cursor-pointer accent-[hsl(var(--accent))]"
                  />
                  <span className={r ? "font-medium" : "text-muted-foreground"}>{nom}</span>
                </label>
                {r ? (
                  <>
                    <select
                      aria-label={`Día de corte para el ${nom.toLowerCase()}`}
                      value={r.corte_dia}
                      onChange={(e) => cambia(d, { corte_dia: Number(e.target.value) })}
                      className={`${campo} cursor-pointer`}
                    >
                      {DIAS.map((n, j) => (j + 1 === d ? null : <option key={n} value={j + 1}>{n}</option>))}
                    </select>
                    <input
                      type="time"
                      aria-label={`Hora de corte para el ${nom.toLowerCase()}`}
                      value={r.corte}
                      onChange={(e) => cambia(d, { corte: e.target.value })}
                      className={campo}
                    />
                  </>
                ) : (
                  <>
                    <span className="text-muted-foreground/60">—</span>
                    <span />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2 rounded-lg border border-border p-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Exprés</legend>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={expres.activo}
            onChange={(e) => setExpres({ ...expres, activo: e.target.checked })}
            className="h-4 w-4 cursor-pointer accent-[hsl(var(--accent))]"
          />
          Ofrecer exprés al cliente
        </label>
        {expres.activo && (
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Llega en (días hábiles)</span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={30}
                value={String(expres.dias)}
                onChange={(e) => setExpres({ ...expres, dias: Number(e.target.value || 0) })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Pedir antes de</span>
              <Input type="time" value={expres.corte} onChange={(e) => setExpres({ ...expres, corte: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Costo por cotización $</span>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                value={String(expres.costo)}
                onChange={(e) => setExpres({ ...expres, costo: Number(e.target.value || 0) })}
              />
            </label>
          </div>
        )}
      </fieldset>

      {ops.length > 0 && (
        <div className="space-y-1 rounded-lg bg-muted/60 px-3 py-2.5 text-[13px] leading-relaxed">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Así lo diría el agente ahora
          </span>
          {ops.map((o) => (
            <span key={o.modo} className="block">
              <b>{o.modo === "ruta" ? "Ruta" : "Exprés"}</b> · llega {o.llega}
              {o.cargo_mxn > 0 ? `, +$${o.cargo_mxn.toLocaleString("es-MX")}` : ""} (pidiendo antes del {o.pide_antes_de})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
