import { NextRequest, NextResponse } from 'next/server';
import { prisma, type OrderStatus } from '@thalimate/db';
import { getSession, requireRole } from '@/lib/auth';
import { enqueueNotification } from '@/lib/queue';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSession();
  requireRole(session, ['ADMIN', 'KITCHEN', 'DELIVERY', 'SUPPORT']);
  const url = new URL(req.url);
  const status = url.searchParams.get('status') as OrderStatus | null;
  const take = Math.min(Number(url.searchParams.get('take') ?? 50), 200);
  const orders = await prisma.order.findMany({
    where: status ? { status } : undefined,
    include: { customer: true, address: true, items: true, plan: true },
    orderBy: { createdAt: 'desc' },
    take,
  });
  return NextResponse.json({ orders });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  requireRole(session, ['ADMIN', 'KITCHEN', 'DELIVERY']);
  const body = (await req.json()) as { id?: string; status?: OrderStatus };
  if (!body.id || !body.status) return NextResponse.json({ error: 'id, status required' }, { status: 400 });

  const updated = await prisma.order.update({
    where: { id: body.id },
    data: {
      status: body.status,
      ...(body.status === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
    },
  });

  const map: Record<OrderStatus, Parameters<typeof enqueueNotification>[0]['kind'] | null> = {
    PENDING_PAYMENT: null,
    PAID: 'order.paid',
    PREPARING: 'order.preparing',
    READY: null,
    OUT_FOR_DELIVERY: 'order.out_for_delivery',
    DELIVERED: 'order.delivered',
    CANCELLED: null,
    REFUNDED: null,
  };
  const kind = map[updated.status];
  if (kind) await enqueueNotification({ kind, orderId: updated.id } as never);

  return NextResponse.json({ order: updated });
}
