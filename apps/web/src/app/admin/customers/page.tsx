import { prisma } from '@thalimate/db';

export default async function CustomersPage() {
  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { _count: { select: { orders: true } } },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Customers</h1>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr className="text-left">
              <th className="p-3">Name</th>
              <th className="p-3">Phone</th>
              <th className="p-3">Orders</th>
              <th className="p-3">Marketing</th>
              <th className="p-3">Joined</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="p-3">{c.name ?? '—'}</td>
                <td className="p-3 font-mono text-xs">{c.phone}</td>
                <td className="p-3">{c._count.orders}</td>
                <td className="p-3">{c.marketingOptIn ? 'Opted in' : 'Opted out'}</td>
                <td className="p-3">{c.createdAt.toLocaleDateString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
