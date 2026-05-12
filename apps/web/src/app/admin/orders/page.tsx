import { prisma } from '@thalimate/db';
import { formatINR, formatISTDate } from '@thalimate/shared';
import { Badge } from '@/components/ui/badge';

const STATUS_COLORS: Record<string, string> = {
  PENDING_PAYMENT: 'bg-yellow-100 text-yellow-800',
  PAID: 'bg-blue-100 text-blue-800',
  PREPARING: 'bg-purple-100 text-purple-800',
  READY: 'bg-indigo-100 text-indigo-800',
  OUT_FOR_DELIVERY: 'bg-orange-100 text-orange-800',
  DELIVERED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-gray-100 text-gray-700',
};

export default async function OrdersPage() {
  const orders = await prisma.order.findMany({
    include: { customer: true, plan: true, items: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Orders</h1>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr className="text-left">
              <th className="p-3">Order</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Plan</th>
              <th className="p-3">Items</th>
              <th className="p-3">Total</th>
              <th className="p-3">Status</th>
              <th className="p-3">Time</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b last:border-0">
                <td className="p-3 font-mono text-xs">{o.code}</td>
                <td className="p-3">{o.customer.name ?? o.customer.phone}</td>
                <td className="p-3">{o.plan?.name ?? '-'}</td>
                <td className="p-3">{o.items.length}</td>
                <td className="p-3 font-medium">{formatINR(o.total)}</td>
                <td className="p-3">
                  <Badge className={STATUS_COLORS[o.status] ?? ''}>{o.status}</Badge>
                </td>
                <td className="p-3 text-muted-foreground">{formatISTDate(o.createdAt)}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  No orders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
