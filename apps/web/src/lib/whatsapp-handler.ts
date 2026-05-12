import {
  prisma,
  type ConversationState,
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
import {
  todayISTDateOnly,
  DEFAULT_DELIVERY_FEE,
  FREE_DELIVERY_THRESHOLD,
  type ConversationContext,
  type SavedAddressLite,
} from '@thalimate/shared';
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

  // Check if returning customer (has any past orders)
  const [orderCount, savedAddresses] = await Promise.all([
    prisma.order.count({ where: { customerId: customer.id } }),
    prisma.address.findMany({
      where: { customerId: customer.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      take: 5,
    }),
  ]);
  const isReturning = orderCount > 0;
  const savedAddressesLite: SavedAddressLite[] = savedAddresses.map((a) => ({
    id: a.id,
    label: a.label,
    line1: a.line1,
    city: a.city,
    pincode: a.pincode,
  }));

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

  // Build menu for any state that may need it
  let menuSections: FsmInput['menuSections'] | undefined;
  if (['AWAITING_DIET', 'CUSTOMIZING', 'AWAITING_CONFIRMATION', 'AWAITING_ADDRESS_CHOICE', 'AWAITING_ADDRESS'].includes(fsmState)) {
    menuSections = await buildMenuSections(ctx, planRules);
  }

  // Compute estimated delivery fee for display
  const deliveryFee = FREE_DELIVERY_THRESHOLD > 0 ? DEFAULT_DELIVERY_FEE : 0;

  const fsmInput: FsmInput = {
    text,
    state: fsmState,
    context: ctx,
    customerName: customer.name ?? undefined,
    isReturning,
    savedAddresses: savedAddressesLite,
    menuSections,
    planRules,
    deliveryFee,
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

  // If we just transitioned into AWAITING_CONFIRMATION from AWAITING_NOTES,
  // send the full order summary as a follow-up (after the "Preparing..." reply).
  if (out.nextState === 'AWAITING_CONFIRMATION' && fsmState === 'AWAITING_NOTES') {
    await sendConfirmationSummary(out.context as ConversationContext, from, conv.id);
  }

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
    case 'SAVE_CUSTOMER_NAME': {
      await prisma.customer.update({
        where: { id: customer.id },
        data: { name: out.action.name },
      });
      break;
    }

    case 'SAVE_ADDRESS': {
      const raw = out.action.raw;
      const parsed = parseAddressText(raw);
      const address = await prisma.address.create({
        data: {
          customerId: customer.id,
          line1: parsed.line1,
          line2: parsed.line2,
          landmark: parsed.landmark,
          city: parsed.city,
          pincode: parsed.pincode,
          isDefault: true,
        },
      });
      // Clear default on older addresses
      await prisma.address.updateMany({
        where: { customerId: customer.id, id: { not: address.id } },
        data: { isDefault: false },
      });
      const ctx = out.context;
      ctx.addressId = address.id;
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { context: ctx as object },
      });
      await sendConfirmationSummary(ctx, customer.phone, conversationId);
      break;
    }

    case 'USE_SAVED_ADDRESS': {
      // Mark as default, set in context
      await prisma.address.updateMany({
        where: { customerId: customer.id },
        data: { isDefault: false },
      });
      await prisma.address.update({
        where: { id: out.action.addressId },
        data: { isDefault: true },
      });
      // ctx.addressId is already set by FSM
      await sendConfirmationSummary(out.context, customer.phone, conversationId);
      break;
    }

    case 'PLACE_ORDER_AND_REQUEST_PAYMENT': {
      const ctx = out.context;
      if (!ctx.planCode || !ctx.mealTime || !ctx.diet || !ctx.selections) return;

      const plan = await prisma.mealPlan.findUnique({ where: { code: ctx.planCode } });
      if (!plan) return;

      const lines = Object.entries(ctx.selections)
        .filter(([, qty]) => qty > 0)
        .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));

      const order = await createOrder({
        customerId: customer.id,
        addressId: ctx.addressId,
        planId: plan.id,
        mealTime: ctx.mealTime,
        diet: ctx.diet,
        lines,
        notes: ctx.notes,
        couponCode: ctx.couponCode,
      });

      const updatedCtx = { ...ctx, draftOrderId: order.id };
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { context: updatedCtx as object },
      });

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
      // Handled elsewhere via post-delivery webhook
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
 * Called after address is set (SAVE_ADDRESS or USE_SAVED_ADDRESS actions).
 * Notes are captured in the next AWAITING_NOTES state before this is triggered.
 * We also send the summary when the customer enters notes (AWAITING_NOTES → AWAITING_CONFIRMATION).
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
    const menuItemIds = Object.keys(selections).filter((k) => (selections[k] ?? 0) > 0);
    if (menuItemIds.length === 0) return;

    const menuItems = await prisma.menuItem.findMany({ where: { id: { in: menuItemIds } } });
    const itemMap = new Map(menuItems.map((m) => [m.id, m]));

    const planRules = (plan.rules as Record<string, number> | null) ?? {};
    const catCount: Record<string, number> = {};
    let extraPaise = 0;

    const summaryItems: Array<{ name: string; qty: number; addonPrice?: number }> = [];
    for (const [id, qty] of Object.entries(selections)) {
      if (!qty) continue;
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

    const subtotal = plan.basePrice + extraPaise;
    const deliveryFee = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DEFAULT_DELIVERY_FEE;
    const total = subtotal + deliveryFee;

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
      notes: ctx.notes,
      basePrice: plan.basePrice,
      extraPrice: extraPaise,
      deliveryFee,
      total,
      estimatedMins: 45,
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

/**
 * Parse multi-line address text into structured fields.
 * Expected format (from bot prompt):
 *   Name
 *   House / Flat, Street
 *   Landmark
 *   City – Pincode
 */
function parseAddressText(raw: string): {
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  pincode: string;
} {
  const lines = raw
    .split(/[\n,]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const pincodeMatch = raw.match(/\b(\d{6})\b/);
  const pincode = pincodeMatch?.[1] ?? '000000';

  // Try to extract city from "City – Pincode" or "City Pincode" pattern
  let city = 'Unknown';
  const cityLine = lines.find((l) => /\d{6}/.test(l));
  if (cityLine) {
    city = cityLine.replace(/[-–\s]*\d{6}.*/, '').trim() || 'Unknown';
  }

  const line1 = lines[1] ?? lines[0] ?? raw.slice(0, 200);
  const line2 = lines.length > 3 ? lines[2] : undefined;
  const landmark = lines.length > 2 ? lines[lines.length - 2] : undefined;

  return { line1, line2, landmark, city, pincode };
}

export async function _testHelpers() {
  void prisma;
}
