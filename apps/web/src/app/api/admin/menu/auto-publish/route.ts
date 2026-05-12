import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@thalimate/db';
import { todayISTDateOnly } from '@thalimate/shared';
import { MealTime, DietType } from '@thalimate/db';

export const runtime = 'nodejs';

/**
 * POST /api/admin/menu/auto-publish
 * Called by n8n cron at 7 AM IST each day.
 * Copies yesterday's daily menus to today if today's menus don't exist yet.
 * Secured by a shared secret header: x-n8n-secret == N8N_INTERNAL_SECRET env var.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-n8n-secret');
  if (!secret || secret !== process.env.N8N_INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = todayISTDateOnly();
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const slots: Array<{ mealTime: MealTime; diet: DietType }> = [
    { mealTime: MealTime.LUNCH, diet: DietType.REGULAR },
    { mealTime: MealTime.LUNCH, diet: DietType.JAIN },
    { mealTime: MealTime.DINNER, diet: DietType.REGULAR },
    { mealTime: MealTime.DINNER, diet: DietType.JAIN },
  ];

  let created = 0;
  let skipped = 0;

  for (const slot of slots) {
    // Check if today's menu already exists
    const existing = await prisma.dailyMenu.findUnique({
      where: { date_mealTime_diet: { date: today, mealTime: slot.mealTime, diet: slot.diet } },
    });
    if (existing) { skipped++; continue; }

    // Copy from yesterday
    const source = await prisma.dailyMenu.findUnique({
      where: { date_mealTime_diet: { date: yesterday, mealTime: slot.mealTime, diet: slot.diet } },
      include: { items: true },
    });
    if (!source) { skipped++; continue; }

    const newMenu = await prisma.dailyMenu.create({
      data: {
        date: today,
        mealTime: slot.mealTime,
        diet: slot.diet,
        active: source.active,
      },
    });

    if (source.items.length > 0) {
      await prisma.dailyMenuItem.createMany({
        data: source.items.map((item) => ({
          dailyMenuId: newMenu.id,
          menuItemId: item.menuItemId,
          position: item.position,
          soldOut: false, // reset sold-out status for new day
        })),
      });
    }
    created++;
  }

  return NextResponse.json({
    ok: true,
    date: today.toISOString().slice(0, 10),
    created,
    skipped,
  });
}
