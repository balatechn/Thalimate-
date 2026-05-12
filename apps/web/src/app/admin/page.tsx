import { prisma } from '@thalimate/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatINR, todayISTDateOnly } from '@thalimate/shared';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<string, string> = {
  PENDING:           'bg-yellow-100 text-yellow-800',
  PAID:              'bg-blue-100 text-blue-800',
  PREPARING:         'bg-orange-100 text-orange-800',
  READY:             'bg-purple-100 text-purple-800',
  OUT_FOR_DELIVERY:  'bg-indigo-100 text-indigo-800',
  DELIVERED:         'bg-green-100 text-green-800',
  CANCELLED:         'bg-red-100 text-red-800',
};

export default async function AdminHome() {
  const today = todayISTDateOnly();
  const tomorrow = new Date(today.getTime() + 86_400_000);

  const [todayOrders, todayRevenue, pendingKitchen, pendingDelivery, customers, recentOrders] = await Promise.all([
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
    prisma.order.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { name: true, phone: true } },
        items: { select: { quantity: true, menuItem: { select: { name: true } } }, take: 2 },
      },
    }),
  ]);

  const stats = [
    { label: "Today's Orders", value: todayOrders.toString() },
    { label: "Today's Revenue", value: formatINR(todayRevenue._sum.total ?? 0) },
    { label: 'Kitchen Queue', value: pendingKitchen.toString() },
    { label: 'Out for Delivery', value: pendingDelivery.toString() },
    { label: 'Total Customers', value: customers.toString() },
  ];

  const quickLinks = [
    { href: '/admin/orders', label: 'View All Orders' },
    { href: '/admin/daily-menu', label: 'Set Today\'s Menu' },
    { href: '/admin/menu', label: 'Menu Items' },
    { href: '/admin/customers', label: 'Customers' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Live overview of ThaliMate operations.</p>
      </div>

      {/* Stats */}
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

      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        {quickLinks.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted transition-colors"
          >
            {l.label}
          </Link>
        ))}
      </div>

      {/* Recent orders */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Recent Orders</CardTitle>
            <Link href="/admin/orders" className="text-sm text-primary hover:underline">View all →</Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Code</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Customer</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Items</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Total</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Time</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No orders yet.</td>
                  </tr>
                )}
                {recentOrders.map((order) => {
                  const itemSummary = order.items
                    .map((i) => `${i.quantity}× ${i.menuItem.name}`)
                    .join(', ') + (order.items.length < (order as { _count?: { items: number } })._count?.items ? '…' : '');
                  const time = new Date(order.createdAt).toLocaleTimeString('en-IN', {
                    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
                  });
                  const badgeCls = STATUS_BADGE[order.status] ?? 'bg-gray-100 text-gray-700';
                  return (
                    <tr key={order.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2 font-mono text-xs">
                        <Link href={`/admin/orders?q=${order.code}`} className="text-primary hover:underline">
                          {order.code}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        <div>{order.customer?.name ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">{order.customer?.phone}</div>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground max-w-[200px] truncate">{itemSummary}</td>
                      <td className="px-4 py-2 font-medium">{formatINR(order.total)}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${badgeCls}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{time}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
