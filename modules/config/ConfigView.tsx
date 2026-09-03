"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ValorBase } from "@/lib/marca";
import type { TiendaInfo } from "@/lib/tienda-info";
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
  valorBase,
  tienda,
  fiadoExige,
  isAdmin,
}: {
  info: string;
  asesores: string;
  valorBase: ValorBase;
  tienda: TiendaInfo;
  /** Whether a credit note here needs a registered customer. Differs by shop. */
  fiadoExige: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(info);
  const [nums, setNums] = useState(asesores);
  const [base, setBase] = useState<ValorBase>(valorBase);
  const [exige, setExige] = useState(fiadoExige);
  // Held as strings: these are form fields, and the action normalises on save.
  const [t, setT] = useState({
    entregaDias: tienda.entregaDias ?? "",
    garantiaDias: tienda.garantiaDias?.toString() ?? "",
    garantiaCondicion: tienda.garantiaCondicion ?? "",
    direccion: tienda.direccion ?? "",
    ciudad: tienda.ciudad ?? "",
    horario: tienda.horario ?? "",
    cp: tienda.origen?.cp ?? "",
    estado: tienda.origen?.estado ?? "",
    municipio: tienda.origen?.municipio ?? "",
    colonia: tienda.origen?.colonia ?? "",
  });
  const campo = (k: keyof typeof t) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setT((prev) => ({ ...prev, [k]: e.target.value }));
  // Pickup branches: shown INSTEAD of the single address wherever a customer
  // chooses "recoger". Rows without an address are dropped on save.
  const [sucs, setSucs] = useState(
    tienda.sucursales.map((s) => ({
      nombre: s.nombre ?? "",
      direccion: s.direccion,
      horario: s.horario ?? "",
    })),
  );
  const sucCampo =
    (i: number, k: "nombre" | "direccion" | "horario") =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setSucs((prev) => prev.map((s, j) => (j === i ? { ...s, [k]: e.target.value } : s)));
  const tiendaEnviada: TiendaInfo = {
    entregaDias: t.entregaDias,
    garantiaDias: t.garantiaDias === "" ? null : Number(t.garantiaDias),
    garantiaCondicion: t.garantiaCondicion,
    direccion: t.direccion,
    ciudad: t.ciudad,
    horario: t.horario,
    sucursales: sucs
      .filter((s) => s.direccion.trim())
      .map((s) => ({ nombre: s.nombre, direccion: s.direccion, horario: s.horario })),
    origen: { cp: t.cp, estado: t.estado, municipio: t.municipio, colonia: t.colonia },
  };
  const sucsSucias =
    JSON.stringify(sucs) !==
    JSON.stringify(
      tienda.sucursales.map((s) => ({
        nombre: s.nombre ?? "",
        direccion: s.direccion,
        horario: s.horario ?? "",
      })),
    );
  const tiendaSucia =
    sucsSucias ||
    JSON.stringify(t) !==
    JSON.stringify({
      entregaDias: tienda.entregaDias ?? "",
      garantiaDias: tienda.garantiaDias?.toString() ?? "",
      garantiaCondicion: tienda.garantiaCondicion ?? "",
      direccion: tienda.direccion ?? "",
      ciudad: tienda.ciudad ?? "",
      horario: tienda.horario ?? "",
      cp: tienda.origen?.cp ?? "",
      estado: tienda.origen?.estado ?? "",
      municipio: tienda.origen?.municipio ?? "",
      colonia: tienda.origen?.colonia ?? "",
    });
  const [pending, start] = useTransition();

  const dirty =
    text !== info || nums !== asesores || base !== valorBase || exige !== fiadoExige || tiendaSucia;

  function save() {
    start(async () => {
      try {
        await updateNegocioInfo(text, nums, base, tiendaEnviada, exige);
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

      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold">Inventario</h2>
        <fieldset className="mt-3" disabled={!isAdmin || pending}>
          <legend className="mb-1.5 text-sm font-medium">
            Valor del inventario
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["costo", "A costo", "Lo que costó surtir lo que hay en piso."],
                ["venta", "A venta", "Lo que vale en el mostrador, al precio de lista."],
              ] as const
            ).map(([valor, titulo, detalle]) => (
              <label
                key={valor}
                className={cn(
                  "flex cursor-pointer gap-2.5 rounded-lg border p-3 transition-colors",
                  base === valor
                    ? "border-ring bg-muted"
                    : "border-border hover:border-ring/40",
                  (!isAdmin || pending) && "cursor-not-allowed opacity-70",
                )}
              >
                <input
                  type="radio"
                  name="valor-base"
                  value={valor}
                  checked={base === valor}
                  onChange={() => setBase(valor)}
                  className="mt-0.5 h-4 w-4 accent-[hsl(var(--brand))]"
                />
                <span>
                  <span className="block text-sm font-medium">{titulo}</span>
                  <span className="block text-xs text-muted-foreground">{detalle}</span>
                </span>
              </label>
            ))}
          </div>
          <span className="mt-2 block text-xs text-muted-foreground">
            Cambia el recuadro <span className="font-medium">Valor</span> en
            Inventario y el total del reporte en PDF. A costo solo lo ven quienes
            tienen permiso de ver costos; a los demás se les sigue mostrando a
            venta, y la etiqueta lo dice.
          </span>
        </fieldset>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold">Notas de crédito</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Un fiado es una deuda, y alguien tiene que quedar identificado como
          quien la debe. Cómo se identifica depende de cómo vende este negocio.
        </p>
        <fieldset className="mt-3 grid gap-2 sm:grid-cols-2" disabled={!isAdmin || pending}>
          {(
            [
              [
                true,
                "Exigir cliente registrado",
                "Queda ligada a la persona: se ve todo lo que debe, hay teléfono a quién llamar y aplica su descuento.",
              ],
              [
                false,
                "Permitir a Mostrador",
                "Para quien no se va a quedar a registrarse. La nota se vuelve obligatoria: es lo único que dirá quién debe.",
              ],
            ] as const
          ).map(([v, titulo, detalle]) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => setExige(v)}
              className={cn(
                "cursor-pointer rounded-lg border p-3 text-left transition-colors",
                exige === v ? "border-ring bg-muted" : "border-border hover:border-ring/40",
              )}
            >
              <span className="block text-sm font-medium">{titulo}</span>
              <span className="block text-xs text-muted-foreground">{detalle}</span>
            </button>
          ))}
        </fieldset>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold">Tienda</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Lo que la tienda pública le promete a un cliente. Lo que dejes vacío
          simplemente no se muestra — es preferible a prometer algo que el
          negocio no cumple.
        </p>
        <fieldset className="mt-4 grid gap-3 sm:grid-cols-2" disabled={!isAdmin || pending}>
          <Campo label="Dirección" value={t.direccion} onChange={campo("direccion")}
            placeholder="5 de Mayo #216, Col. Centro, León, Guanajuato" />
          <Campo label="Ciudad" value={t.ciudad} onChange={campo("ciudad")} placeholder="León, Gto." />
          <Campo label="Horario" value={t.horario} onChange={campo("horario")} placeholder="Lun–Sáb · 10:00–19:00" />
          <Campo label="Tiempo de entrega" value={t.entregaDias} onChange={campo("entregaDias")} placeholder="1 a 2 días" />
          <Campo label="Días de garantía" value={t.garantiaDias} onChange={campo("garantiaDias")} placeholder="30" />
          <Campo label="Condición de la garantía" value={t.garantiaCondicion}
            onChange={campo("garantiaCondicion")} placeholder="devolviendo la pieza con sus sellos intactos" />
        </fieldset>

        <fieldset className="mt-5" disabled={!isAdmin || pending}>
          <legend className="text-sm font-medium">Sucursales para recoger</legend>
          <p className="mb-2 mt-1 text-xs text-muted-foreground">
            Si llenas sucursales, la tienda muestra estas direcciones (todas) en
            lugar de la de arriba cuando el cliente elige recoger. Una fila sin
            dirección se descarta al guardar.
          </p>
          <div className="space-y-2">
            {sucs.map((s, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_1fr_auto]">
                <Campo label={i === 0 ? "Nombre" : ""} value={s.nombre}
                  onChange={sucCampo(i, "nombre")} placeholder="Centro" />
                <Campo label={i === 0 ? "Dirección" : ""} value={s.direccion}
                  onChange={sucCampo(i, "direccion")}
                  placeholder="5 de Mayo #216, Col. Centro, León, Gto." />
                <Campo label={i === 0 ? "Horario" : ""} value={s.horario}
                  onChange={sucCampo(i, "horario")} placeholder="Lun–Sáb · 10:00–19:00" />
                <button
                  type="button"
                  onClick={() => setSucs((prev) => prev.filter((_, j) => j !== i))}
                  className="cursor-pointer self-end pb-2 text-xs text-muted-foreground hover:text-destructive"
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => setSucs((prev) => [...prev, { nombre: "", direccion: "", horario: "" }])}
          >
            Agregar sucursal
          </Button>
        </fieldset>

        <fieldset className="mt-5" disabled={!isAdmin || pending}>
          <legend className="text-sm font-medium">Origen de envío</legend>
          <p className="mb-2 mt-1 text-xs text-muted-foreground">
            Desde dónde cotiza la paquetería. Los cuatro campos o ninguno: un
            origen a medias cotiza desde el lugar equivocado y ese cobro se le
            hace a un cliente real.
          </p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Campo label="C.P." value={t.cp} onChange={campo("cp")} placeholder="37000" />
            <Campo label="Estado" value={t.estado} onChange={campo("estado")} placeholder="Guanajuato" />
            <Campo label="Municipio" value={t.municipio} onChange={campo("municipio")} placeholder="Leon" />
            <Campo label="Colonia" value={t.colonia} onChange={campo("colonia")} placeholder="Centro" />
          </div>
        </fieldset>
      </Card>

      {isAdmin ? (
        <div className="flex justify-end">
          <Button onClick={save} loading={pending} disabled={!dirty}>
            Guardar
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Solo administradores pueden editar.
        </p>
      )}
    </section>
  );
}

function Campo({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <Input value={value} onChange={onChange} placeholder={placeholder} />
    </label>
  );
}
