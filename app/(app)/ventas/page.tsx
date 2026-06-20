import { Receipt } from "lucide-react";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { formatMXN } from "@/lib/money";
import type { Sale } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SalesScreen, type SalesProduct } from "@/modules/sales/SalesScreen";

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  otro: "Otro",
};

export default async function VentasPage() {
  const insforge = await createInsForgeServerClient();

  const [{ data: productData }, { data: salesData }] = await Promise.all([
    insforge.database
      .from("products")
      .select("id, sku, name, size, price_cents, quantity")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    insforge.database
      .from("sales")
      .select("id, total_cents, payment_method, customer_name, created_at")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const products = (productData ?? []) as SalesProduct[];
  const sales = (salesData ?? []) as Sale[];

  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Busca, agrega al carrito y cobra. El stock se descuenta solo.
        </p>
      </div>

      <SalesScreen products={products} />

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground">
          Ventas recientes
        </h2>
        {sales.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Aún no hay ventas"
            description="Las ventas que registres aparecerán aquí."
            className="mt-3"
          />
        ) : (
          <Card className="mt-3 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Fecha</th>
                  <th className="px-4 py-2.5 font-medium">Cliente</th>
                  <th className="px-4 py-2.5 font-medium">Pago</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {new Date(s.created_at).toLocaleString("es-MX", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-4 py-2.5">{s.customer_name ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone="neutral">
                        {s.payment_method
                          ? (PAYMENT_LABELS[s.payment_method] ?? s.payment_method)
                          : "—"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {formatMXN(s.total_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </section>
  );
}
