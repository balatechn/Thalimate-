import {
  prisma,
  type ConversationState,
  type DailyMenu,
  type MenuItem,
  type Customer,
  MealTime,
  DietType,
} from '@thalimate/db';
import {
  handleMessage,
  type FsmInput,
  type FsmOutput,
  type FsmState,
  evolutionFromEnv,
} from '@thalimate/whatsapp';
import { todayISTDateOnly, type ConversationContext } from '@thalimate/shared';
import { createOrder } from './orders';
import { logger } from './logger';
import { buildUpiUrl, upiQrPngBuffer } from './upi';
import { createRazorpayOrder } from './razorpay';
import { enqueueNotification } from './queue';

/** Map FSM string to Prisma enum (they share names). */
const toState = (s: FsmState): ConversationState => s as ConversationState;
const fromState = (s: ConversationState): FsmState => s as FsmState;

interface IncomingMessage {
  from: string; // E.164
  text: string;
  providerMsgId?: string;
}

export async function handleIncoming(msg: IncomingMessage): Promise<void> {
  const { from, text } = msg;
  const customer = await upsertCustomer(from);
  const conv = await prisma.conversation.upsert({
    where: { id: await getOrCreateConvId(customer.id) },
    update: { lastMsgAt: new Date() },
    create: { customerId: customer.id, lastMsgAt: new Date(), state: 'IDLE', context: {} },
  });

  await prisma.conversationMessage.create({
    data: {
      conversationId: conv.id,
      direction: 'IN',
      body: text,
      providerMsgId: msg.providerMsgId,
    },
  });

  // Build catalog context based on current FSM state
  const fsmState = fromState(conv.state);
  const ctx = (conv.context as ConversationContext) ?? {};
  const plans = await prisma.mealPlan.findMany({ where: { active: true }, orderBy: { basePrice: 'asc' } });

  // Resolve plan rules for the currently selected plan
  let planRules: FsmInput['planRules'] | undefined;
  if (ctx.planCode) {
    const selectedPlan = plans.find((p) => p.code === ctx.planCode);
    if (selectedPlan?.rules) {
      const rules = selectedPlan.rules as Record<string, number>;
      planRules = Object.fromEntries(
        Object.entries(rules).map(([k, v]) => [k.toLowerCase(), v as number]),
      );
    }
  }

  // Build menu for any state that may transition into CUSTOMIZING (AWAITING_DIET)
  // or that is already browsing (CUSTOMIZING, AWAITING_CONFIRMATION)
  let menuSections: FsmInput['menuSections'] | undefined;
  if (['AWAITING_DIET', 'CUSTOMIZING', 'AWAITING_CONFIRMATION'].includes(fsmState)) {
    menuSections = await buildMenuSections(ctx, planRules);
  }

  const fsmInput: FsmInput = {
    text,
    state: fsmState,
    context: ctx,
    customerName: customer.name ?? undefined,
    menuSections,
    planRules,
    plans: plans.map((p) => ({ id: p.id, code: p.code, name: p.name, basePrice: p.basePrice })),
  };

  const out = handleMessage(fsmInput);

  // Persist new state
  await prisma.conversation.update({
    where: { id: conv.id },
    data: { state: toState(out.nextState), context: out.context as object },
  });

  // Execute side-effect actions
  await executeAction(out, customer, conv.id);

  // Send reply
  const evo = evolutionFromEnv();
  try {
    const sent = await evo.sendText(from, out.reply);
    await prisma.conversationMessage.create({
      data: {
        conversationId: conv.id,
        direction: 'OUT',
        body: out.reply,
        providerMsgId: sent.id,
      },
    });
  } catch (err) {
    logger.error({ err }, 'failed to send WhatsApp reply');
  }
}

async function executeAction(out: FsmOutput, customer: Customer, conversationId: string): Promise<void> {
  if (!out.action) return;

  switch (out.action.kind) {
    case 'SAVE_ADDRESS': {
      const raw = out.action.raw;
      const address = await prisma.address.create({
        data: {
          customerId: customer.id,
          line1: raw.slice(0, 200),
          city: 'Unknown',
          pincode: extractPincode(raw) ?? '000000',
          isDefault: true,
        },
      });
      const ctx = out.context;
      ctx.addressId = address.id;
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { context: ctx as object },
      });

      // Send confirmation summary as a follow-up message
      await sendConfirmationSummary(ctx, customer.phone, conversationId);
      break;
    }

    case 'PLACE_ORDER_AND_REQUEST_PAYMENT': {
      const ctx = out.context;
      if (!ctx.planCode || !ctx.mealTime || !ctx.diet || !ctx.selections) return;

      const plan = await prisma.mealPlan.findUnique({ where: { code: ctx.planCode } });
      if (!plan) return;

      const lines = Object.entries(ctx.selections).map(([menuItemId, quantity]) => ({
        menuItemId,
        quantity,
      }));

      const order = await createOrder({
        customerId: customer.id,
        addressId: ctx.addressId,
        planId: plan.id,
        mealTime: ctx.mealTime,
        diet: ctx.diet,
        lines,
      });

      ctx.draftOrderId = order.id;
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { context: ctx as object },
      });

      // Generate payment
      await createPaymentForOrder(order.id, customer.phone);
      await enqueueNotification({ kind: 'order.created', orderId: order.id });
      break;
    }

    case 'CANCEL_ORDER': {
      if (out.context.draftOrderId) {
        await prisma.order.update({
          where: { id: out.context.draftOrderId },
          data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'Customer cancelled via WhatsApp' },
        });
      }
      break;
    }

    case 'CAPTURE_FEEDBACK': {
      // Implemented elsewhere
      break;
    }
  }
}

async function createPaymentForOrder(orderId: string, customerPhone: string): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  const provider = (process.env.PAYMENT_PROVIDER ?? 'upi_qr') as 'razorpay' | 'upi_qr';
  const evo = evolutionFromEnv();

  if (provider === 'razorpay') {
    try {
      const rp = await createRazorpayOrder(order.total, order.code);
      await prisma.payment.create({
        data: {
          orderId: order.id,
          provider: 'RAZORPAY',
          status: 'PENDING',
          amount: order.total,
          providerOrderId: rp.id,
        },
      });
      const payUrl = `${process.env.APP_URL}/pay/${order.code}`;
      await evo.sendText(
        customerPhone,
        `Pay ₹${(order.total / 100).toFixed(2)} to confirm:\n${payUrl}`,
      );
      return;
    } catch (err) {
      logger.warn({ err }, 'razorpay failed, falling back to UPI QR');
    }
  }

  // UPI QR fallback
  const upiUrl = buildUpiUrl({
    vpa: process.env.UPI_VPA ?? 'thalimate@upi',
    payeeName: process.env.UPI_PAYEE_NAME ?? 'ThaliMate',
    amount: order.total,
    txnRef: order.code,
  });
  await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: 'UPI_QR',
      status: 'PENDING',
      amount: order.total,
      upiVpa: process.env.UPI_VPA,
      qrPayload: upiUrl,
    },
  });

  // Send QR image
  try {
    const png = await upiQrPngBuffer(upiUrl);
    const qrUrl = `${process.env.APP_URL}/api/payments/qr/${order.code}.png`;
    await evo.sendImage(
      customerPhone,
      qrUrl,
      `Pay ₹${(order.total / 100).toFixed(2)} for order ${order.code}.\nUPI: ${process.env.UPI_VPA}`,
    );
    void png;
    const { t } = await import('@thalimate/whatsapp');
    await evo.sendText(customerPhone, t.paymentLink(order.total));
  } catch (err) {
    logger.error({ err }, 'failed to send UPI QR');
    await evo.sendText(
      customerPhone,
      `Pay ₹${(order.total / 100).toFixed(2)} via UPI to ${process.env.UPI_VPA}\nReference: ${order.code}`,
    );
  }
}

/**
 * Build and send the order confirmation summary message.
 * Called after SAVE_ADDRESS so the customer sees a full summary before confirming.
 */
async function sendConfirmationSummary(
  ctx: ConversationContext,
  customerPhone: string,
  conversationId: string,
): Promise<void> {
  try {
    if (!ctx.planCode || !ctx.mealTime || !ctx.diet || !ctx.addressId) return;

    const [plan, address] = await Promise.all([
      prisma.mealPlan.findUnique({ where: { code: ctx.planCode } }),
      prisma.address.findUnique({ where: { id: ctx.addressId } }),
    ]);
    if (!plan || !address) return;

    const selections = ctx.selections ?? {};
    const menuItemIds = Object.keys(selections);
    if (menuItemIds.length === 0) return;

    const menuItems = await prisma.menuItem.findMany({ where: { id: { in: menuItemIds } } });
    const itemMap = new Map(menuItems.map((m) => [m.id, m]));

    const planRules = (plan.rules as Record<string, number> | null) ?? {};
    const catCount: Record<string, number> = {};
    let extraPaise = 0;

    const summaryItems: Array<{ name: string; qty: number; addonPrice?: number }> = [];
    for (const [id, qty] of Object.entries(selections)) {
      const item = itemMap.get(id);
      if (!item) continue;
      const cat = item.category.toLowerCase();
      const freeAllowed = planRules[cat] ?? 0;
      const alreadyUsed = catCount[cat] ?? 0;
      const freeHere = Math.max(0, freeAllowed - alreadyUsed);
      const paidQty = Math.max(0, qty - freeHere);
      catCount[cat] = alreadyUsed + qty;
      const addonCost = paidQty * item.price;
      extraPaise += addonCost;
      summaryItems.push({ name: item.name, qty, addonPrice: addonCost > 0 ? addonCost : undefined });
    }

    const total = plan.basePrice + extraPaise;
    const addressStr = [address.line1, address.line2, address.landmark, address.city, address.pincode]
      .filter(Boolean)
      .join(', ');

    const { t } = await import('@thalimate/whatsapp');
    const msg = t.confirmation({
      plan: plan.name,
      diet: ctx.diet,
      mealTime: ctx.mealTime,
      items: summaryItems,
      address: addressStr,
      basePrice: plan.basePrice,
      extraPrice: extraPaise,
      total,
    });

    const evo = evolutionFromEnv();
    const sent = await evo.sendText(customerPhone, msg);
    await prisma.conversationMessage.create({
      data: { conversationId, direction: 'OUT', body: msg, providerMsgId: sent.id },
    });
  } catch (err) {
    logger.error({ err }, 'failed to send confirmation summary');
  }
}

async function upsertCustomer(phone: string): Promise<Customer> {
  return prisma.customer.upsert({
    where: { phone },
    update: {},
    create: { phone },
  });
}

async function getOrCreateConvId(customerId: string): Promise<string> {
  const existing = await prisma.conversation.findFirst({
    where: { customerId },
    orderBy: { updatedAt: 'desc' },
  });
  if (existing) return existing.id;
  const created = await prisma.conversation.create({
    data: { customerId, state: 'IDLE', context: {} },
  });
  return created.id;
}

async function buildMenuSections(
  ctx: ConversationContext,
  planRules?: Record<string, number>,
): Promise<FsmInput['menuSections']> {
  const date = todayISTDateOnly();
  const mealTime = (ctx.mealTime ?? 'LUNCH') as MealTime;
  const diet = (ctx.diet ?? 'REGULAR') as DietType;

  const menu = await prisma.dailyMenu.findUnique({
    where: { date_mealTime_diet: { date, mealTime, diet } },
    include: { items: { include: { menuItem: true } } },
  });
  if (!menu) return [];

  const grouped = new Map<string, Array<MenuItem & { soldOut: boolean }>>();
  for (const dmi of menu.items) {
    if (!dmi.menuItem.active) continue;
    const arr = grouped.get(dmi.menuItem.category) ?? [];
    arr.push({ ...dmi.menuItem, soldOut: dmi.soldOut });
    grouped.set(dmi.menuItem.category, arr);
  }

  let idx = 0;
  const order = ['SABZI', 'DAL', 'RICE', 'ROTI', 'SWEET', 'FARSAN', 'ADDON'];
  return order
    .filter((cat) => grouped.has(cat))
    .map((cat) => ({
      title: cat,
      includedCount: planRules ? (planRules[cat.toLowerCase()] ?? 0) : undefined,
      items: (grouped.get(cat) ?? [])
        .filter((it) => !it.soldOut)
        .map((it) => ({
          idx: ++idx,
          id: it.id,
          name: it.name,
          price: it.price > 0 ? it.price : undefined,
        })),
    }));
}

function extractPincode(raw: string): string | null {
  const m = raw.match(/\b(\d{6})\b/);
  return m?.[1] ?? null;
}

export async function _testHelpers() {
  // exported for type-safety
  void prisma;
}
