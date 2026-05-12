import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@thalimate/db';
import { menuItemSchema } from '@thalimate/shared';
import { getSession, requireRole } from '@/lib/auth';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  requireRole(session, ['ADMIN']);
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = menuItemSchema.partial().safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const updated = await prisma.menuItem.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ item: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  requireRole(session, ['ADMIN']);
  const { id } = await params;
  await prisma.menuItem.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
