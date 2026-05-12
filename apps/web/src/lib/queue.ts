import { Queue, QueueEvents } from 'bullmq';
import { redis } from './redis';

const connection = { connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' } };

export const QUEUES = {
  notifications: 'notifications',
  payments: 'payments',
  followups: 'followups',
  campaigns: 'campaigns',
} as const;

export const notificationsQueue = new Queue(QUEUES.notifications, connection);
export const paymentsQueue = new Queue(QUEUES.payments, connection);
export const followupsQueue = new Queue(QUEUES.followups, connection);
export const campaignsQueue = new Queue(QUEUES.campaigns, connection);

export type NotificationJob =
  | { kind: 'order.created'; orderId: string }
  | { kind: 'order.paid'; orderId: string }
  | { kind: 'order.preparing'; orderId: string }
  | { kind: 'order.out_for_delivery'; orderId: string }
  | { kind: 'order.delivered'; orderId: string }
  | { kind: 'whatsapp.text'; to: string; text: string }
  | { kind: 'whatsapp.image'; to: string; imageUrl: string; caption?: string };

export async function enqueueNotification(job: NotificationJob) {
  await notificationsQueue.add(job.kind, job, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });

  // Fire-and-forget ping to n8n order-notification webhook
  if (job.kind === 'order.created' || job.kind === 'order.paid') {
    const n8nUrl = process.env.N8N_ORDER_WEBHOOK_URL;
    const secret = process.env.N8N_INTERNAL_SECRET;
    if (n8nUrl) {
      fetch(n8nUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(secret ? { 'x-n8n-secret': secret } : {}) },
        body: JSON.stringify(job),
      }).catch(() => { /* non-critical */ });
    }
  }
}

// keep ts happy
void redis;
void QueueEvents;
