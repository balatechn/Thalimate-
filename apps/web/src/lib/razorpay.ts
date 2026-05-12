import Razorpay from 'razorpay';
import crypto from 'node:crypto';

let _client: Razorpay | null = null;

export function razorpay(): Razorpay {
  if (_client) return _client;
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) throw new Error('Razorpay keys not configured');
  _client = new Razorpay({ key_id, key_secret });
  return _client;
}

export async function createRazorpayOrder(amountPaise: number, receipt: string) {
  return razorpay().orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt,
    payment_capture: true,
  });
}

export function verifyRazorpaySignature(body: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}
