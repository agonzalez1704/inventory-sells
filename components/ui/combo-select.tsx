"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { normalize } from "@/lib/search";
import { cn } from "@/lib/utils";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "./combobox";

export type Opcion = { value: string; label: string };

/**
 * A <select> you can type into: long lists (53 refacciones, 300 marcas) are
 * found by typing, accents and case ignored. `vacio` adds a first "none"
 * option ("Todas", "Sin sistema"); `onCrear` offers to add what was typed
 * when nothing matches.
 */
export function ComboSelect({
  opciones,
  valor,
  onChange,
  vacio,
  onCrear,
  placeholder = "Escribe para buscar…",
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  opciones: Opcion[];
  valor: string;
  onChange: (v: string) => void;
  vacio?: string;
  /** Resolve to the new option (it's selected) or null to cancel. */
  onCrear?: (texto: string) => Promise<Opcion | null>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  // Created here but not in `opciones` yet (the parent refreshes later), or a
  // free-text value like a new marca.
  const [creadas, setCreadas] = useState<Opcion[]>([]);
  const todas = [...opciones, ...creadas.filter((c) => !opciones.some((o) => o.value === c.value))];
  if (valor && !todas.some((o) => o.value === valor)) todas.push({ value: valor, label: valor });
  const items = vacio ? [{ value: "", label: vacio }, ...todas] : todas;
  const actual = items.find((o) => o.value === valor) ?? null;
  const [q, setQ] = useState("");
  const [creando, setCreando] = useState(false);
  const texto = q.trim();
  const existe = todas.some((o) => normalize(o.label) === normalize(texto));

  const crear = async () => {
    if (!onCrear || creando) return;
    setCreando(true);
    try {
      const nueva = await onCrear(texto);
      if (nueva) {
        setCreadas((c) => [...c, nueva]);
        onChange(nueva.value);
      }
    } finally {
      setCreando(false);
    }
  };

  return (
    <Combobox
      items={items}
      value={actual}
      onValueChange={(o) => onChange((o as Opcion | null)?.value ?? "")}
      onInputValueChange={setQ}
      itemToStringLabel={(o: Opcion) => o.label}
      isItemEqualToValue={(a: Opcion, b: Opcion) => a.value === b.value}
      // Reopening shows the whole list, not just the option already picked.
      filter={(o: Opcion, s: string) => !s.trim() || s === actual?.label || normalize(o.label).includes(normalize(s))}
      autoHighlight
      openOnInputClick
      disabled={disabled}
    >
      <ComboboxInput
        placeholder={actual ? actual.label : placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
        // Typing replaces the picked option instead of appending to it.
        onFocus={(e) => e.currentTarget.select()}
        className={cn("h-10 rounded-lg", valor && vacio && "border-brand", className)}
      />
      <ComboboxContent>
        <ComboboxEmpty>{onCrear && texto ? null : "Sin resultados"}</ComboboxEmpty>
        <ComboboxList>
          {(o: Opcion) => (
            <ComboboxItem key={o.value || "__vacio"} value={o} className={cn(!o.value && "text-muted-foreground")}>
              {o.label}
            </ComboboxItem>
          )}
        </ComboboxList>
        {onCrear && texto && !existe && (
          <button
            type="button"
            onClick={crear}
            disabled={creando}
            className="flex w-full cursor-pointer items-center gap-2 border-t border-border px-4 py-3 text-left text-sm font-medium hover:bg-muted"
          >
            <Plus className="h-4 w-4" /> Crear «{texto}»
          </button>
        )}
      </ComboboxContent>
    </Combobox>
  );
}
