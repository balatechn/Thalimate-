import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@thalimate/db';
import { menuItemSchema } from '@thalimate/shared';
import { getSession, requireRole } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSession();
  requireRole(session, ['ADMIN', 'KITCHEN', 'SUPPORT']);
  const url = new URL(req.url);
  const category = url.searchParams.get('category') ?? undefined;
  const items = await prisma.menuItem.findMany({
    where: category ? { category: category as never } : undefined,
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  requireRole(session, ['ADMIN']);
  const body = await req.json().catch(() => null);
  const parsed = menuItemSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const created = await prisma.menuItem.create({ data: parsed.data });
  return NextResponse.json({ item: created }, { status: 201 });
}
