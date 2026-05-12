import { prisma } from '@thalimate/db';
import { getSession, requireRole } from '@/lib/auth';
import DailyMenuEditor from './_components/DailyMenuEditor';

export const dynamic = 'force-dynamic';

export default async function DailyMenuPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await getSession();
  requireRole(session, ['ADMIN', 'KITCHEN']);

  const sp = await searchParams;
  const dateStr = sp.date ?? new Date().toISOString().split('T')[0];
  const date = new Date(dateStr + 'T00:00:00.000Z');

  const [menus, allItems] = await Promise.all([
    prisma.dailyMenu.findMany({
      where: { date },
      include: { items: { include: { menuItem: true }, orderBy: { position: 'asc' } } },
    }),
    prisma.menuItem.findMany({
      where: { active: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    }),
  ]);

  const slots = ['LUNCH-REGULAR', 'LUNCH-JAIN', 'DINNER-REGULAR', 'DINNER-JAIN'] as const;

  const slotData = slots.map((slot) => {
    const [mealTime, diet] = slot.split('-') as ['LUNCH' | 'DINNER', 'REGULAR' | 'JAIN'];
    const menu = menus.find((m) => m.mealTime === mealTime && m.diet === diet);
    return {
      slot,
      mealTime,
      diet,
      menuId: menu?.id ?? null,
      active: menu?.active ?? true,
      itemIds: menu?.items.map((i) => i.menuItemId) ?? [],
      soldOut: Object.fromEntries(menu?.items.map((i) => [i.menuItemId, i.soldOut]) ?? []),
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Daily Menu</h1>
        <p className="text-muted-foreground mt-1">Configure the menu for each meal slot and diet type.</p>
      </div>
      <DailyMenuEditor date={dateStr ?? ''} slots={slotData} allItems={allItems} />
    </div>
  );
}
