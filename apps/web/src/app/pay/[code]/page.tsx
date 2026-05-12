import { prisma } from '@thalimate/db';
import { formatINR } from '@thalimate/shared';
import { upiQrDataUrl } from '@/lib/upi';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function PayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const order = await prisma.order.findUnique({
    where: { code },
    include: { payments: true, customer: true },
  });
  if (!order) notFound();

  const payment = order.payments[0];
  const qrDataUrl = payment?.qrPayload ? await upiQrDataUrl(payment.qrPayload) : null;

  return (
    <main className="container py-12">
      <div className="mx-auto max-w-md rounded-lg border bg-card p-6 space-y-6 text-center">
        <div>
          <p className="text-sm text-muted-foreground">Order</p>
          <p className="font-mono text-lg">{order.code}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Amount Due</p>
          <p className="text-4xl font-bold">{formatINR(order.total)}</p>
        </div>

        {order.status === 'PAID' ? (
          <p className="text-primary text-lg font-semibold">✅ Payment received. Your order is being prepared!</p>
        ) : qrDataUrl ? (
          <>
            <img src={qrDataUrl} alt="UPI QR" className="mx-auto rounded-md border" />
            <p className="text-sm text-muted-foreground">
              Scan with any UPI app (GPay, PhonePe, Paytm, BHIM)
            </p>
            <p className="text-xs text-muted-foreground">UPI ID: {process.env.UPI_VPA}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Awaiting payment instructions…</p>
        )}
      </div>
    </main>
  );
}
