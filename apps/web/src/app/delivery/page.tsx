import { prisma } from '@thalimate/db';
import { formatINR } from '@thalimate/shared';

export const dynamic = 'force-dynamic';

export default async function DeliveryPage() {
  const orders = await prisma.order.findMany({
    where: { status: { in: ['READY', 'OUT_FOR_DELIVERY'] } },
    include: { customer: true, address: true },
    orderBy: { createdAt: 'asc' },
  });

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <h1 className="text-3xl font-bold">Delivery Board</h1>
        <div className="grid gap-4 md:grid-cols-2">
          {orders.map((o) => {
            const mapsUrl =
              o.address?.mapsUrl ??
              (o.address
                ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    `${o.address.line1}, ${o.address.city} ${o.address.pincode}`,
                  )}`
                : null);
            return (
              <div key={o.id} className="rounded-lg border bg-card p-4 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">{o.code}</p>
                    <p className="font-semibold">{o.customer.name ?? o.customer.phone}</p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs">{o.status}</span>
                </div>
                <p className="text-sm">📞 <a href={`tel:${o.customer.phone}`} className="underline">{o.customer.phone}</a></p>
                {o.address && (
                  <p className="text-sm">
                    📍 {o.address.line1}{o.address.line2 ? `, ${o.address.line2}` : ''} — {o.address.city} {o.address.pincode}
                  </p>
                )}
                <p className="text-sm font-medium">{formatINR(o.total)} (Paid)</p>
                <div className="flex gap-2 pt-2">
                  {mapsUrl && (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 rounded-md border px-3 py-1.5 text-center text-sm hover:bg-accent"
                    >
                      Maps
                    </a>
                  )}
                  <form action="/api/admin/orders" method="post" className="flex-1">
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="status" value={o.status === 'READY' ? 'OUT_FOR_DELIVERY' : 'DELIVERED'} />
                    <button
                      formAction="/api/admin/orders"
                      formMethod="POST"
                      className="w-full rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
                    >
                      Mark {o.status === 'READY' ? 'Out for Delivery' : 'Delivered'}
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
          {orders.length === 0 && (
            <p className="col-span-full text-center text-muted-foreground py-12">No deliveries pending.</p>
          )}
        </div>
      </div>
    </div>
  );
}
