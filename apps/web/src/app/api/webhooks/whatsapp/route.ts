import { NextRequest, NextResponse } from 'next/server';
import { evolutionWebhookSchema, normalizePhone } from '@thalimate/shared';
import { handleIncoming } from '@/lib/whatsapp-handler';
import { verifyHmac } from '@/lib/hmac';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get('x-hub-signature-256') ?? req.headers.get('x-signature');
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET;

  if (secret && !verifyHmac(secret, raw, sig)) {
    logger.warn('webhook signature mismatch');
    return new NextResponse('Forbidden', { status: 403 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse('Bad JSON', { status: 400 });
  }

  const parsed = evolutionWebhookSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const event = parsed.data.event;
  const data = parsed.data.data as Record<string, unknown>;

  // Only process inbound text messages
  if (!['messages.upsert', 'message.upsert', 'MESSAGES_UPSERT'].includes(event)) {
    return NextResponse.json({ ok: true, ignored: event });
  }

  const key = (data.key as Record<string, unknown> | undefined) ?? {};
  const fromMe = key['fromMe'] === true;
  if (fromMe) return NextResponse.json({ ok: true, ignored: 'self' });

  const remoteJid = String(key['remoteJid'] ?? '');
  const phone = normalizePhone(remoteJid.split('@')[0] ?? '');
  if (!phone) return NextResponse.json({ ok: false, error: 'no phone' }, { status: 400 });

  // Rate-limit per phone
  const rl = await rateLimit(`wa:${phone}`, 30, 60);
  if (!rl.ok) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });

  const message = (data.message ?? {}) as Record<string, unknown>;
  const text =
    (message['conversation'] as string | undefined) ??
    ((message['extendedTextMessage'] as { text?: string } | undefined)?.text) ??
    ((message['buttonsResponseMessage'] as { selectedButtonId?: string } | undefined)?.selectedButtonId) ??
    '';

  if (!text) return NextResponse.json({ ok: true, ignored: 'no-text' });

  try {
    await handleIncoming({
      from: phone,
      text,
      providerMsgId: String(key['id'] ?? ''),
    });
  } catch (err) {
    logger.error({ err }, 'whatsapp handler failed');
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
