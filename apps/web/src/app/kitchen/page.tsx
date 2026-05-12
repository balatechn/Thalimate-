import { prisma } from '@thalimate/db';
import { formatISTDate } from '@thalimate/shared';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function KitchenPage() {
  const orders = await prisma.order.findMany({
    where: { status: { in: ['PAID', 'PREPARING', 'READY'] } },
    include: { customer: true, items: true, address: true, plan: true },
    orderBy: { createdAt: 'asc' },
  });

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Kitchen Queue</h1>
          <p className="text-sm text-muted-foreground">{orders.length} active orders</p>
        </header>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orders.map((o) => (
            <article key={o.id} className="rounded-lg border bg-card p-4 space-y-3">
              <header className="flex justify-between items-start">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">{o.code}</p>
                  <p className="font-semibold">{o.plan?.name}</p>
                  <p className="text-xs">{o.mealTime} • {o.diet}</p>
                </div>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs">{o.status}</span>
              </header>
              <ul className="text-sm space-y-1">
                {o.items.map((it) => (
                  <li key={it.id} className="flex justify-between">
                    <span>{it.quantity}× {it.name}</span>
                    <span className="text-muted-foreground text-xs">{it.category}</span>
                  </li>
                ))}
              </ul>
              {o.notes && <p className="text-xs italic text-muted-foreground">Note: {o.notes}</p>}
              <footer className="flex items-center justify-between pt-2 border-t">
                <span className="text-xs text-muted-foreground">{formatISTDate(o.createdAt, 'hh:mm a')}</span>
                <Link
                  href={`/kitchen/print/${o.code}`}
                  target="_blank"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Print →
                </Link>
              </footer>
            </article>
          ))}
          {orders.length === 0 && (
            <p className="col-span-full text-center text-muted-foreground py-12">No active orders. 🎉</p>
          )}
        </div>
      </div>
    </div>
  );
}
