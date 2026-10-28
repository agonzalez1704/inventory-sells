import { requirePagePermiso } from "@/lib/auth/profile";
import { ImportarPrecios } from "@/modules/catalogo/ImportarPrecios";

export default async function ImportarPreciosPage() {
  await requirePagePermiso("precios_gestionar", "/catalogo");
  return <ImportarPrecios />;
}
