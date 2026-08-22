"use server";

import { auth } from "@clerk/nextjs/server";
import { updateTag } from "next/cache";
import { getProfile } from "@/lib/auth/profile";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import type { ValorBase } from "@/lib/marca";
import { normalizarTienda, type TiendaInfo } from "@/lib/tienda-info";

export async function updateNegocioInfo(
  info: string,
  asesores: string,
  valorBase: ValorBase,
  tienda: TiendaInfo,
  fiadoExige: boolean,
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const profile = await getProfile(userId);
  if (profile?.role !== "admin") throw new Error("Solo administradores");

  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database
    .from("config_negocio")
    // Normalised on the way in as well as out: the form sends strings, and a
    // half-filled origin must be stored as no origin rather than as three
    // fields a courier will quote from.
    .update({
      info,
      asesores,
      valor_base: valorBase,
      tienda: normalizarTienda(tienda),
      fiado_exige_cliente: fiadoExige,
    })
    .eq("id", 1);
  if (error) throw new Error(error.message ??"Error al guardar");
  // The storefront chrome caches this read ("use cache" in getTiendaInfo);
  // saving here is the only writer, so this pairing is the whole invalidation
  // story (nextjs-app-like.md steps 2+3).
  updateTag("tienda-info");
}

/**
 * Whether a credit note needs a registered customer, per shop.
 *
 * Fiable sells to walk-ins who will not stand still to be registered; Ruli
 * wants the debt tied to a person. Same code, one database each, so the answer
 * lives with the shop rather than in a branch on the brand.
 *
 * Defaults to true on any failure: refusing an anonymous debt is the safe way
 * to be wrong.
 */
export async function fiadoExigeCliente(): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) return true;
  const insforge = await createInsForgeServerClient();
  const { data } = await insforge.database
    .from("config_negocio")
    .select("fiado_exige_cliente")
    .eq("id", 1)
    .maybeSingle();
  return (data as { fiado_exige_cliente: boolean } | null)?.fiado_exige_cliente ?? true;
}


/**
 * POS behavior: does a plain click add to the sale, or open the detail sheet?
 * An admin's choice for the whole shop. Defaults to click-adds on any failure —
 * the behavior every shop had before the switch existed.
 */
export async function posClickAbreDetalle(): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) return false;
  const insforge = await createInsForgeServerClient();
  const { data } = await insforge.database
    .from("config_negocio")
    .select("pos_click_abre_detalle")
    .eq("id", 1)
    .maybeSingle();
  return (data as { pos_click_abre_detalle: boolean } | null)?.pos_click_abre_detalle ?? false;
}


/** Flip the shop-wide POS click behavior. Admin only; applies to everyone. */
export async function setPosClickAbreDetalle(valor: boolean): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const profile = await getProfile(userId);
  if (profile?.role !== "admin") throw new Error("Solo administradores");
  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database
    .from("config_negocio")
    .update({ pos_click_abre_detalle: valor })
    .eq("id", 1);
  if (error) throw new Error(error.message ?? "No se pudo guardar");
}
