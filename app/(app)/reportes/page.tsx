import { auth } from "@clerk/nextjs/server";
import { TrendingUp, Coins, HandCoins, AlertTriangle } from "lucide-react";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { getProfile } from "@/lib/auth/profile";
import { formatMXN } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

type MonthSale = {
  created_at: string;
  total_cents: number;
  sale_items: {
    qty: number;
    unit_price_cents: number;
    products: { name: string; sku: string; cost_cents: number } | null;
  }[];
};

function dayKey(d: Date) {
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD (local)
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

export default async function ReportesPage() {
  const { userId } = await auth();
  const profile = userId ? await getProfile(userId) : null;
  const isAdmin = profile?.role === "admin";

  const insforge = await createInsForgeServerClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [{ data: monthData }, { data: pendingData }, { data: productData }] =
    await Promise.all([
      insforge.database
        .from("sales")
        .select(
          "created_at, total_cents, sale_items(qty, unit_price_cents, products(name, sku, cost_cents))",
        )
        .eq("status", "completed")
        .gte("created_at", since),
      insforge.database.from("sales").select("total_cents").eq("status", "pending"),
      insforge.database.from("products").select("quantity").eq("is_active", true),
    ]);

  const sales = (monthData ?? []) as unknown as MonthSale[];
  const pending = (pendingData ?? []) as { total_cents: number }[];
  const products = (productData ?? []) as { quantity: number }[];

  // Day buckets (last 7 days, local).
  const days: { date: Date; label: string; total: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push({
      date: d,
      label: d.toLocaleDateString("es-MX", { weekday: "short" }),
      total: 0,
    });
  }
  const byKey = new Map(days.map((d) => [dayKey(d.date), d]));

  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  let revToday = 0;
  let revWeek = 0;
  let revMonth = 0;
  let cogsMonth = 0;
  const top = new Map<string, { name: string; qty: number; revenue: number }>();

  for (const s of sales) {
    const when = new Date(s.created_at);
    revMonth += s.total_cents;
    if (when >= startToday) revToday += s.total_cents;
    if (when >= weekAgo) revWeek += s.total_cents;
    const bucket = byKey.get(dayKey(when));
    if (bucket) bucket.total += s.total_cents;

    for (const it of s.sale_items ?? []) {
      cogsMonth += (it.products?.cost_cents ?? 0) * it.qty;
      const name = it.products?.name ?? "—";
      const cur = top.get(name) ?? { name, qty: 0, revenue: 0 };
      cur.qty += it.qty;
      cur.revenue += it.unit_price_cents * it.qty;
      top.set(name, cur);
    }
  }

  const profitMonth = revMonth - cogsMonth;
  const topProducts = [...top.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const fiadosTotal = pending.reduce((s, p) => s + p.total_cents, 0);
  const lowStock = products.filter((p) => p.quantity > 0 && p.quantity <= 5).length;
  const outStock = products.filter((p) => p.quantity === 0).length;
  const maxDay = Math.max(1, ...days.map((d) => d.total));
  const hasSales = sales.length > 0;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
        <p className="mt-1 text-sm text-muted-foreground">Últimos 30 días.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={TrendingUp} label="Ventas hoy" value={formatMXN(revToday)} sub={`7 días: ${formatMXN(revWeek)}`} />
        <Kpi icon={Coins} label="Ventas (30 días)" value={formatMXN(revMonth)} sub={`${sales.length} ventas`} />
        {isAdmin && (
          <Kpi
            icon={Coins}
            label="Ganancia est. (30 días)"
            value={formatMXN(profitMonth)}
            sub="Precio − costo actual"
          />
        )}
        <Kpi icon={HandCoins} label="Fiado por cobrar" value={formatMXN(fiadosTotal)} sub={`${pending.length} pendientes`} />
        {!isAdmin && (
          <Kpi
            icon={AlertTriangle}
            label="Stock bajo / agotado"
            value={`${lowStock} / ${outStock}`}
          />
        )}
      </div>

      {/* 7-day chart */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold">Ventas por día</h2>
        {hasSales ? (
          <div className="mt-5 flex h-32 items-end gap-2">
            {days.map((d, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t bg-accent/80"
                    style={{ height: `${Math.max(2, (d.total / maxDay) * 100)}%` }}
                    title={formatMXN(d.total)}
                  />
                </div>
                <span className="text-[10px] capitalize text-muted-foreground">
                  {d.label}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Aún no hay ventas.</p>
        )}
      </Card>

      {/* Top products */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground">
          Más vendidos (30 días)
        </h2>
        {topProducts.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="Sin ventas todavía"
            description="Aquí verás tus productos más vendidos."
            className="mt-3"
          />
        ) : (
          <Card className="mt-3 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Producto</th>
                  <th className="px-4 py-2.5 text-right font-medium">Vendidos</th>
                  <th className="px-4 py-2.5 text-right font-medium">Ingreso</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p) => (
                  <tr key={p.name} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2.5">{p.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{p.qty}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {formatMXN(p.revenue)}
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
