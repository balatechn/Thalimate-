import 'dotenv/config';
import { Worker, Queue } from 'bullmq';
import pino from 'pino';
import { prisma } from '@thalimate/db';
import { evolutionFromEnv, t } from '@thalimate/whatsapp';
import { formatINR } from '@thalimate/shared';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info', base: { app: 'thalimate-worker' } });
const connection = { connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' } };

type NotificationJob =
  | { kind: 'order.created'; orderId: string }
  | { kind: 'order.paid'; orderId: string }
  | { kind: 'order.preparing'; orderId: string }
  | { kind: 'order.out_for_delivery'; orderId: string }
  | { kind: 'order.delivered'; orderId: string }
  | { kind: 'whatsapp.text'; to: string; text: string }
  | { kind: 'whatsapp.image'; to: string; imageUrl: string; caption?: string };

const evo = evolutionFromEnv();

// ----- Notifications worker -----
const notificationsWorker = new Worker(
  'notifications',
  async (job) => {
    const data = job.data as NotificationJob;
    logger.info({ kind: data.kind }, 'processing notification');

    switch (data.kind) {
      case 'whatsapp.text':
        await evo.sendText(data.to, data.text);
        return;
      case 'whatsapp.image':
        await evo.sendImage(data.to, data.imageUrl, data.caption);
        return;
    }

    const order = await prisma.order.findUnique({
      where: { id: data.orderId },
      include: { customer: true },
    });
    if (!order) return;

    const phone = order.customer.phone;
    switch (data.kind) {
      case 'order.created':
        await evo.sendText(phone, `Order ${order.code} received. Total ${formatINR(order.total)}. Awaiting payment.`);
        break;
      case 'order.paid':
        await evo.sendText(phone, t.paid(order.code));
        // Schedule follow-up after delivery (2h)
        await followupsQueue.add(
          'feedback-request',
          { orderId: order.id },
          { delay: 1000 * 60 * 60 * 2, attempts: 3 },
        );
        break;
      case 'order.preparing':
        await evo.sendText(phone, t.preparing(order.code));
        break;
      case 'order.out_for_delivery':
        await evo.sendText(phone, t.outForDelivery(order.code));
        break;
      case 'order.delivered':
        await evo.sendText(phone, t.delivered(order.code));
        break;
    }
  },
  { ...connection, concurrency: 5 },
);

notificationsWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'notification job failed');
});

// ----- Follow-ups -----
const followupsQueue = new Queue('followups', connection);
const followupsWorker = new Worker(
  'followups',
  async (job) => {
    if (job.name === 'feedback-request') {
      const { orderId } = job.data as { orderId: string };
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { customer: true, feedback: true },
      });
      if (!order || order.feedback) return;
      await evo.sendText(
        order.customer.phone,
        `How was your order ${order.code}? Reply 1-5 to rate. Your feedback helps us improve! 🙏`,
      );
    }
  },
  { ...connection, concurrency: 3 },
);
followupsWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'followup failed'));

// ----- Campaigns -----
const campaignsWorker = new Worker(
  'campaigns',
  async (job) => {
    const { campaignId } = job.data as { campaignId: string };
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { recipients: { include: { customer: true } } },
    });
    if (!campaign) return;

    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'RUNNING' } });

    let sent = 0;
    let failed = 0;
    for (const r of campaign.recipients) {
      if (r.sent || r.customer.blocked || !r.customer.marketingOptIn) continue;
      try {
        const text = renderTemplate(campaign.template, { name: r.customer.name ?? 'there' });
        await evo.sendText(r.customer.phone, text);
        await prisma.campaignRecipient.update({
          where: { id: r.id },
          data: { sent: true, sentAt: new Date() },
        });
        sent++;
        // gentle pacing to avoid bans
        await new Promise((res) => setTimeout(res, 1500));
      } catch (err) {
        failed++;
        await prisma.campaignRecipient.update({
          where: { id: r.id },
          data: { failed: true, error: String(err).slice(0, 500) },
        });
      }
    }
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: 'COMPLETED', sentCount: sent, failedCount: failed },
    });
  },
  { ...connection, concurrency: 1 },
);
campaignsWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'campaign failed'));

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => vars[k] ?? '');
}

logger.info('🚀 ThaliMate worker started');

// Graceful shutdown
async function shutdown() {
  logger.info('shutting down…');
  await Promise.all([notificationsWorker.close(), followupsWorker.close(), campaignsWorker.close()]);
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
