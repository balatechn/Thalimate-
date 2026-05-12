import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@thalimate/db';
import { loginSchema } from '@thalimate/shared';
import { rateLimit } from '@/lib/rate-limit';
import { signSession, setSessionCookie, verifyPassword } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  const rl = await rateLimit(`login:${ip}`, 10, 60);
  if (!rl.ok) return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });

  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !user.active) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

  const token = await signSession({ sub: user.id, email: user.email, role: user.role });
  await setSessionCookie(token);
  return NextResponse.json({ ok: true, role: user.role });
}
