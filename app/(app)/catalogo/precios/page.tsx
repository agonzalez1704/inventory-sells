import { requirePagePermiso } from "@/lib/auth/profile";
import { ImportarPrecios } from "@/modules/catalogo/ImportarPrecios";
import { factorLista } from "@/modules/catalogo/actions";

export default async function ImportarPreciosPage() {
  await requirePagePermiso("precios_gestionar", "/catalogo");
  return <ImportarPrecios factorGrob={await factorLista("grob")} />;
}
