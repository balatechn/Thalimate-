import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@thalimate/db';
import { dailyMenuSchema } from '@thalimate/shared';
import { getSession, requireRole } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSession();
  requireRole(session, ['ADMIN', 'KITCHEN']);
  const url = new URL(req.url);
  const dateStr = url.searchParams.get('date');
  const date = dateStr ? new Date(dateStr) : new Date();
  date.setUTCHours(0, 0, 0, 0);
  const menus = await prisma.dailyMenu.findMany({
    where: { date },
    include: { items: { include: { menuItem: true } } },
  });
  return NextResponse.json({ menus });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  requireRole(session, ['ADMIN']);
  const body = await req.json().catch(() => null);
  const parsed = dailyMenuSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { date, mealTime, diet, active = true, itemIds, soldOut = {} } = parsed.data;
  const day = new Date(date);
  day.setUTCHours(0, 0, 0, 0);

  const menu = await prisma.dailyMenu.upsert({
    where: { date_mealTime_diet: { date: day, mealTime, diet } },
    update: { active },
    create: { date: day, mealTime, diet, active },
  });
  // Replace items
  await prisma.dailyMenuItem.deleteMany({ where: { dailyMenuId: menu.id } });
  await prisma.dailyMenuItem.createMany({
    data: itemIds.map((menuItemId, position) => ({
      dailyMenuId: menu.id,
      menuItemId,
      position,
      soldOut: soldOut[menuItemId] ?? false,
    })),
  });
  return NextResponse.json({ menu });
}
