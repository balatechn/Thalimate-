import { NextResponse } from 'next/server';
import { prisma } from '@thalimate/db';
import { getSession, requireRole } from '@/lib/auth';
import { todayISTDateOnly } from '@thalimate/shared';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  requireRole(session, ['ADMIN']);
  const today = todayISTDateOnly();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const last7 = new Date(today.getTime() - 6 * 86_400_000);

  const [todayOrders, todayRevenue, totalCustomers, last7Series, topItemsRaw] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: today, lt: tomorrow }, status: { not: 'CANCELLED' } } }),
    prisma.order.aggregate({
      _sum: { total: true },
      where: { createdAt: { gte: today, lt: tomorrow }, status: { in: ['PAID', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED'] } },
    }),
    prisma.customer.count(),
    prisma.$queryRaw<Array<{ d: Date; revenue: number; orders: number }>>`
      SELECT DATE_TRUNC('day', "createdAt")::date as d,
             SUM(total)::int as revenue,
             COUNT(*)::int as orders
      FROM "Order"
      WHERE "createdAt" >= ${last7}
        AND status IN ('PAID','PREPARING','OUT_FOR_DELIVERY','DELIVERED')
      GROUP BY 1 ORDER BY 1 ASC`,
    prisma.orderItem.groupBy({
      by: ['name'],
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5,
    }),
  ]);

  return NextResponse.json({
    today: {
      orders: todayOrders,
      revenue: todayRevenue._sum.total ?? 0,
    },
    customers: totalCustomers,
    series: last7Series,
    topItems: topItemsRaw.map((t) => ({ name: t.name, qty: t._sum.quantity ?? 0 })),
  });
}
