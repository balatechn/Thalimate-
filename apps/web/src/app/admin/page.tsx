import { prisma } from '@thalimate/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatINR, todayISTDateOnly } from '@thalimate/shared';

export default async function AdminHome() {
  const today = todayISTDateOnly();
  const tomorrow = new Date(today.getTime() + 86_400_000);

  const [todayOrders, todayRevenue, pendingKitchen, pendingDelivery, customers] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: today, lt: tomorrow }, status: { not: 'CANCELLED' } } }),
    prisma.order.aggregate({
      _sum: { total: true },
      where: {
        createdAt: { gte: today, lt: tomorrow },
        status: { in: ['PAID', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED'] },
      },
    }),
    prisma.order.count({ where: { status: { in: ['PAID', 'PREPARING'] } } }),
    prisma.order.count({ where: { status: { in: ['READY', 'OUT_FOR_DELIVERY'] } } }),
    prisma.customer.count(),
  ]);

  const stats = [
    { label: "Today's Orders", value: todayOrders.toString() },
    { label: "Today's Revenue", value: formatINR(todayRevenue._sum.total ?? 0) },
    { label: 'Kitchen Queue', value: pendingKitchen.toString() },
    { label: 'Out for Delivery', value: pendingDelivery.toString() },
    { label: 'Total Customers', value: customers.toString() },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Live overview of ThaliMate operations.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground font-normal">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
