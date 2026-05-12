import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@thalimate/db';
import { verifyRazorpaySignature } from '@/lib/razorpay';
import { enqueueNotification } from '@/lib/queue';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get('x-razorpay-signature');
  if (!verifyRazorpaySignature(raw, sig)) {
    logger.warn('razorpay signature mismatch');
    return new NextResponse('Forbidden', { status: 403 });
  }

  const body = JSON.parse(raw) as { event: string; payload: Record<string, { entity?: Record<string, unknown> }> };
  const event = body.event;

  if (event === 'payment.captured' || event === 'order.paid') {
    const paymentEntity = body.payload?.payment?.entity as Record<string, unknown> | undefined;
    const orderEntity = body.payload?.order?.entity as Record<string, unknown> | undefined;
    const providerOrderId = String(paymentEntity?.['order_id'] ?? orderEntity?.['id'] ?? '');
    const providerPaymentId = String(paymentEntity?.['id'] ?? '');

    const payment = await prisma.payment.findFirst({ where: { providerOrderId } });
    if (!payment) return NextResponse.json({ ok: true, ignored: 'unknown_order' });

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCESS',
        providerPaymentId,
        paidAt: new Date(),
        rawPayload: body as object,
      },
    });
    await prisma.order.update({
      where: { id: payment.orderId },
      data: { status: 'PAID' },
    });
    await enqueueNotification({ kind: 'order.paid', orderId: payment.orderId });
  }

  if (event === 'payment.failed') {
    const paymentEntity = body.payload?.payment?.entity as Record<string, unknown> | undefined;
    const providerOrderId = String(paymentEntity?.['order_id'] ?? '');
    const payment = await prisma.payment.findFirst({ where: { providerOrderId } });
    if (payment) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', rawPayload: body as object },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
