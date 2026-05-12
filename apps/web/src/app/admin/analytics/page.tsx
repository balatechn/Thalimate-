import { prisma } from '@thalimate/db';
import { formatINR, todayISTDateOnly } from '@thalimate/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function AnalyticsPage() {
  const today = todayISTDateOnly();
  const last30 = new Date(today.getTime() - 29 * 86_400_000);

  const series = await prisma.$queryRaw<Array<{ d: Date; revenue: number; orders: number }>>`
    SELECT DATE_TRUNC('day', "createdAt")::date as d,
           SUM(total)::int as revenue,
           COUNT(*)::int as orders
    FROM "Order"
    WHERE "createdAt" >= ${last30}
      AND status IN ('PAID','PREPARING','OUT_FOR_DELIVERY','DELIVERED')
    GROUP BY 1 ORDER BY 1 ASC`;

  const top = await prisma.orderItem.groupBy({
    by: ['name'],
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: 10,
  });

  const totalRevenue = series.reduce((s, r) => s + (r.revenue ?? 0), 0);
  const totalOrders = series.reduce((s, r) => s + (r.orders ?? 0), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Analytics</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Revenue (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatINR(totalRevenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Orders (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalOrders}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Avg Order Value</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatINR(totalOrders ? Math.round(totalRevenue / totalOrders) : 0)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top Items</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2">
            {top.map((t, i) => (
              <li key={t.name} className="flex justify-between border-b pb-2 last:border-0">
                <span>{i + 1}. {t.name}</span>
                <span className="font-medium">{t._sum.quantity ?? 0} sold</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
