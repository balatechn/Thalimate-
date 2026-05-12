import crypto from 'node:crypto';

/**
 * Verify HMAC signature for incoming Evolution / Razorpay webhooks.
 */
export function verifyHmac(secret: string, payload: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const provided = signature.replace(/^sha256=/, '');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
  } catch {
    return false;
  }
}
