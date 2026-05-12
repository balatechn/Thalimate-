import { NextRequest, NextResponse } from 'next/server';
import { prisma, type OrderStatus } from '@thalimate/db';
import { getSession, requireRole } from '@/lib/auth';
import { evolutionFromEnv, t } from '@thalimate/whatsapp';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

/** GET /api/admin/orders/[code] — fetch a single order by code */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const session = await getSession();
  requireRole(session, ['ADMIN', 'KITCHEN', 'DELIVERY', 'SUPPORT']);
  const { code } = await params;
  const order = await prisma.order.findFirst({
    where: { code },
    include: { customer: true, address: true, items: { include: { menuItem: true } }, plan: true },
  });
  if (!order) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(order);
}

/**
 * PATCH /api/admin/orders/[code]/status
 * Used by n8n payment-confirmation workflow to mark an order PAID.
 * Accepts either a session cookie (admin) or the N8N_INTERNAL_SECRET header.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = (await req.json().catch(() => ({}))) as { status?: OrderStatus; secret?: string };

  // Allow n8n to call this endpoint with the shared secret
  const n8nSecret = req.headers.get('x-n8n-secret') ?? body.secret;
  const isN8n = n8nSecret && n8nSecret === process.env.N8N_INTERNAL_SECRET;

  if (!isN8n) {
    const session = await getSession();
    requireRole(session, ['ADMIN', 'KITCHEN']);
  }

  const validStatuses: OrderStatus[] = ['PAID', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];
  const newStatus = body.status;
  if (!newStatus || !validStatuses.includes(newStatus)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }

  const order = await prisma.order.findFirst({
    where: { code },
    include: { customer: true },
  });
  if (!order) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: newStatus,
      ...(newStatus === 'PAID' ? { paidAt: new Date() } : {}),
      ...(newStatus === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
      ...(newStatus === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
    },
  });

  // Notify customer via WhatsApp
  try {
    const evo = evolutionFromEnv();
    const phone = order.customer.phone;
    if (newStatus === 'PAID') await evo.sendText(phone, t.paid(order.code));
    else if (newStatus === 'PREPARING') await evo.sendText(phone, t.preparing(order.code));
    else if (newStatus === 'OUT_FOR_DELIVERY') await evo.sendText(phone, t.outForDelivery(order.code));
    else if (newStatus === 'DELIVERED') await evo.sendText(phone, t.delivered(order.code));
  } catch (err) {
    logger.error({ err }, 'failed to send status WhatsApp notification');
  }

  return NextResponse.json({ ok: true, code, status: newStatus });
}
