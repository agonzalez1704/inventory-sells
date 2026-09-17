import { getProfile, requirePagePermiso } from "@/lib/auth/profile";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { getTiendaInfo } from "@/modules/config/lib";
import { PedidosView, type PedidoWeb } from "@/modules/pedidos/PedidosView";


export default async function PedidosPage() {
  const userId = await requirePagePermiso("surtir");
  const profile = await getProfile(userId);
  const isAdmin = profile?.role === "admin";

  // Pending first (that's what needs action), then the rest, newest within each.
  const { data } = await insforgeAdmin.database
    .from("ordenes_web")
    .select(
      "id, folio, nombre, telefono, email, cp, estado, municipio, direccion, referencias, status, metodo, tipo_entrega, total_cents, envio_cents, envio_desc, created_at, paid_at, apartada_hasta, sucursal, dropship_estado, dropship_ref, preparado_at, listo_at, enviado_at, entregado_at, guia_paqueteria, guia_numero, guia_costo_cents, entrega_nota, cotizacion_id, cotizaciones(folio), orden_web_items(nombre, qty, products(sku, image_url, quantity, enlace_proveedor, inventories(name, es_dropship, sucursales(nombre))))",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  // PostgREST returns to-one embeds as objects; the SDK types them as arrays.
  const pedidos = ((data ?? []) as unknown as (PedidoWeb & { cotizaciones: { folio: string } | null })[]).map((p) => ({
    ...p,
    cotizacion_folio: p.cotizaciones?.folio ?? null,
  }));

  // Pickup + dropship means the supplier ships to the SHOP; hand the operator
  // that address instead of a blank block.
  const tienda = await getTiendaInfo();
  const dirTienda = [tienda.direccion, tienda.origen?.colonia, tienda.origen?.municipio, tienda.origen?.estado, tienda.origen?.cp]
    .filter(Boolean)
    .join(", ");

  return <PedidosView pedidos={pedidos} isAdmin={isAdmin} dirTienda={dirTienda || null} />;
}
