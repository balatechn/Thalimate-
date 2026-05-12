import { prisma } from '@thalimate/db';
import { formatINR } from '@thalimate/shared';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function MenuPage() {
  const items = await prisma.menuItem.findMany({
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Menu Items</h1>
        <Link
          href="/admin/menu/new"
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
        >
          + New Item
        </Link>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <div key={it.id} className="rounded-lg border p-4 flex justify-between items-start">
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{it.name}</p>
              {it.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{it.description}</p>}
              <div className="flex flex-wrap gap-2 mt-1">
                <Badge variant="outline">{it.category}</Badge>
                <Badge variant="secondary">{it.diet}</Badge>
                {!it.active && <Badge variant="destructive">Inactive</Badge>}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 ml-3 shrink-0">
              <p className="font-medium text-sm">{it.price > 0 ? formatINR(it.price) : 'Included'}</p>
              <Link
                href={`/admin/menu/${it.id}`}
                className="text-xs text-primary hover:underline"
              >
                Edit
              </Link>
            </div>
          </div>
        ))}
      </div>
      {items.length === 0 && (
        <p className="text-muted-foreground text-sm">No menu items yet. <Link href="/admin/menu/new" className="text-primary hover:underline">Add the first one.</Link></p>
      )}
    </div>
  );
}
