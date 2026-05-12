import { prisma } from '@thalimate/db';
import { formatINR, formatISTDate } from '@thalimate/shared';
import { OrderStatusSelect } from '../_components/OrderStatusSelect';
import type { OrderStatus } from '@thalimate/db';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const orders = await prisma.order.findMany({
    include: { customer: true, plan: true, items: { include: { menuItem: true } }, address: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Orders</h1>
          <p className="text-muted-foreground text-sm">Latest 100 orders. Status changes notify the customer via WhatsApp.</p>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr className="text-left">
              <th className="p-3 font-medium">Order</th>
              <th className="p-3 font-medium">Customer</th>
              <th className="p-3 font-medium">Plan</th>
              <th className="p-3 font-medium">Meal</th>
              <th className="p-3 font-medium">Items</th>
              <th className="p-3 font-medium">Total</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b last:border-0 hover:bg-muted/20">
                <td className="p-3 font-mono text-xs">{o.code}</td>
                <td className="p-3">
                  <div>{o.customer.name ?? '—'}</div>
                  <div className="text-xs text-muted-foreground">{o.customer.phone}</div>
                </td>
                <td className="p-3">{o.plan?.name ?? '—'}</td>
                <td className="p-3 text-xs">
                  <div>{o.mealTime}</div>
                  <div className="text-muted-foreground">{o.diet}</div>
                </td>
                <td className="p-3">
                  <div className="text-xs space-y-0.5">
                    {o.items.slice(0, 3).map((it) => (
                      <div key={it.id}>{it.name} ×{it.quantity}</div>
                    ))}
                    {o.items.length > 3 && (
                      <div className="text-muted-foreground">+{o.items.length - 3} more</div>
                    )}
                  </div>
                </td>
                <td className="p-3 font-medium">{formatINR(o.total)}</td>
                <td className="p-3">
                  <OrderStatusSelect orderCode={o.code} currentStatus={o.status as OrderStatus} />
                </td>
                <td className="p-3 text-muted-foreground text-xs">{formatISTDate(o.createdAt, 'dd MMM, hh:mm a')}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted-foreground">
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
