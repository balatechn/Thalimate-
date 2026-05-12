import { prisma } from '@thalimate/db';
import { formatINR } from '@thalimate/shared';
import { Badge } from '@/components/ui/badge';

export default async function MenuPage() {
  const items = await prisma.menuItem.findMany({
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Menu Items</h1>
        <a
          href="/admin/menu/new"
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
        >
          + New Item
        </a>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <div key={it.id} className="rounded-lg border p-4 flex justify-between items-start">
            <div>
              <p className="font-medium">{it.name}</p>
              <div className="flex gap-2 mt-1">
                <Badge>{it.category}</Badge>
                <Badge className="bg-secondary">{it.diet}</Badge>
                {!it.active && <Badge className="bg-destructive text-destructive-foreground">Inactive</Badge>}
              </div>
            </div>
            <p className="font-medium">{it.price > 0 ? formatINR(it.price) : 'Included'}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
