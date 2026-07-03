import { auth } from "@clerk/nextjs/server";
import { getProfile } from "@/lib/auth/profile";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { mxHoy, rangoUTC } from "@/lib/caja-range";
import { CajaView, type Gasto, type Ingreso } from "@/modules/caja/CajaView";
import type { PaymentMethod } from "@/lib/types";

export const dynamic = "force-dynamic";

const METODOS: PaymentMethod[] = ["efectivo", "tarjeta", "transferencia", "otro"];
const cero = () =>
  Object.fromEntries(METODOS.map((m) => [m, 0])) as Record<PaymentMethod, number>;

type VentaRow = {
  total_cents: number;
  payment_method: PaymentMethod | null;
  sale_items: {
    qty: number;
    unit_price_cents: number;
    products: { etiqueta: string | null } | null;
  }[];
};

export default async function CajaPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const from = sp.from ?? mxHoy();
  const to = sp.to ?? from;
  const { startISO, endISO } = rangoUTC(from, to);

  const { userId } = await auth();
  const profile = userId ? await getProfile(userId) : null;
  const isAdmin = profile?.role === "admin";

  const insforge = await createInsForgeServerClient();

  // Cash hits the drawer when a sale completes: for direct sales that's
  // created_at; for a fiado it's settled_at (settled in this range, even if
  // lent earlier). Filtering on settled_at also naturally excludes direct
  // sales (their settled_at is null).
  const [
    { data: directas },
    { data: cobrados },
    { data: gastosData },
    { data: ingresosData },
  ] = await Promise.all([
    insforge.database
      .from("sales")
      .select(
        "total_cents, payment_method, sale_items(qty, unit_price_cents, products(etiqueta))",
      )
      .eq("status", "completed")
      .is("settled_at", null)
      .gte("created_at", startISO)
      .lt("created_at", endISO),
    insforge.database
      .from("sales")
      .select(
        "total_cents, payment_method, sale_items(qty, unit_price_cents, products(etiqueta))",
      )
      .eq("status", "completed")
      .gte("settled_at", startISO)
      .lt("settled_at", endISO),
    insforge.database
      .from("gastos")
      .select("id, concepto, monto_cents, metodo, categoria, created_at")
      .gte("created_at", startISO)
      .lt("created_at", endISO)
      .order("created_at", { ascending: false }),
    insforge.database
      .from("ingresos")
      .select("id, concepto, monto_cents, metodo, categoria, created_at")
      .gte("created_at", startISO)
      .lt("created_at", endISO)
      .order("created_at", { ascending: false }),
  ]);

  const ventas = [
    ...((directas ?? []) as unknown as VentaRow[]),
    ...((cobrados ?? []) as unknown as VentaRow[]),
  ];
  const gastos = (gastosData ?? []) as Gasto[];
  const ingresos = (ingresosData ?? []) as Ingreso[];

  // Income = product sales + extra income (installations, labor…), by method.
  const ingresosPorMetodo = cero();
  let ingresosTotal = 0;
  // Of which: revenue from tagged products, split out per tag for the corte.
  const etiquetadoMap: Record<string, number> = {};
  for (const v of ventas) {
    ingresosPorMetodo[v.payment_method ?? "otro"] += v.total_cents;
    ingresosTotal += v.total_cents;
    for (const it of v.sale_items ?? []) {
      const tag = it.products?.etiqueta;
      if (tag) etiquetadoMap[tag] = (etiquetadoMap[tag] ?? 0) + it.unit_price_cents * it.qty;
    }
  }
  for (const i of ingresos) {
    ingresosPorMetodo[i.metodo] += i.monto_cents;
    ingresosTotal += i.monto_cents;
  }
  const etiquetado = Object.entries(etiquetadoMap)
    .map(([tag, monto]) => ({ tag, monto }))
    .sort((a, b) => b.monto - a.monto);

  const gastosPorMetodo = cero();
  let gastosTotal = 0;
  for (const g of gastos) {
    gastosPorMetodo[g.metodo] += g.monto_cents;
    gastosTotal += g.monto_cents;
  }

  return (
    <CajaView
      data={{
        from,
        to,
        isAdmin,
        ventasCount: ventas.length,
        ingresosPorMetodo,
        gastosPorMetodo,
        ingresosTotal,
        gastosTotal,
        gastos,
        ingresos,
        etiquetado,
      }}
    />
  );
}
