import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@thalimate/db';
import { upiQrPngBuffer } from '@/lib/upi';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const orderCode = code.replace(/\.png$/, '');
  const order = await prisma.order.findUnique({
    where: { code: orderCode },
    include: { payments: true },
  });
  if (!order) return new NextResponse('Not found', { status: 404 });
  const payment = order.payments.find((p) => p.qrPayload);
  if (!payment?.qrPayload) return new NextResponse('No QR', { status: 404 });

  const png = await upiQrPngBuffer(payment.qrPayload);
  return new NextResponse(png as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
