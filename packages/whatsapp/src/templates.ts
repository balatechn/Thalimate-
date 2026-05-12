import { formatINR } from '@thalimate/shared';
import type { MenuSection } from './fsm';

export const t = {
  greeting: (name?: string) =>
    `Welcome to *ThaliMate* 🍱${name ? `\nHi ${name}!` : ''}\n\nPlease choose your meal type:\n\n1️⃣ Lunch\n2️⃣ Dinner\n\nReply with *1* or *2*.`,

  askPlan: (plans: Array<{ name: string; basePrice: number }>) => {
    const nums = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
    const list = plans
      .map((p, i) => `${nums[i] ?? `${i + 1}.`} ${p.name} — ${formatINR(p.basePrice)}`)
      .join('\n');
    return `Great! Choose your *Meal Box*:\n\n${list}\n\nReply with the number.`;
  },

  askDiet: () =>
    `Choose your *dietary preference*:\n\n1️⃣ Regular\n2️⃣ Jain\n\nReply with *1* or *2*.`,

  showMenu: (sections: MenuSection[]) => {
    const body = sections
      .map((s) => {
        const header =
          s.includedCount != null
            ? `*${s.title}* (${s.includedCount} included in plan)`
            : `*${s.title}*`;
        const items = s.items
          .map((i) => `  ${i.idx}. ${i.name}${i.price ? `  _(+${formatINR(i.price)})_` : ''}`)
          .join('\n');
        return `${header}\n${items}`;
      })
      .join('\n\n');
    return (
      `🍽️ *Today's Menu*\nReply with item numbers separated by commas.\n` +
      `Example: \`1,4\` or \`2x2,5\` for quantities.\n\n` +
      `${body}\n\n` +
      `Type *done* when finished, *back* to change plan, or *cancel* to abort.`
    );
  },

  selectionUpdate: (
    addedNames: string[],
    lines: Array<{ name: string; qty: number; free: boolean }>,
    extraPaise: number,
  ) => {
    const addedStr = addedNames.length ? `✅ Added: ${addedNames.join(', ')}\n\n` : '';
    const basket =
      lines.length === 0
        ? '_(empty)_'
        : lines.map((l) => `  • ${l.name} ×${l.qty}${l.free ? ' ✓' : ''}`).join('\n');
    const extraNote = extraPaise > 0 ? `\n💰 Extra add-ons: *+${formatINR(extraPaise)}*` : '';
    return (
      `${addedStr}*Your basket:*\n${basket}${extraNote}\n\n` +
      `Type more numbers, *done* when finished, or *back* to change plan.`
    );
  },

  askAddress: () =>
    `📍 Please share your *delivery address*:\n\n_Format:_\n_Name_\n_House / Flat, Street_\n_Landmark_\n_City – Pincode_`,

  confirmation: (params: {
    plan: string;
    diet: string;
    mealTime: string;
    items: Array<{ name: string; qty: number; addonPrice?: number }>;
    address: string;
    basePrice: number;
    extraPrice: number;
    total: number;
  }) => {
    const itemLines = params.items
      .map((i) => ` • ${i.name} ×${i.qty}${i.addonPrice ? ` (+${formatINR(i.addonPrice)})` : ''}`)
      .join('\n');
    return (
      `*📋 Order Summary*\n\n` +
      `🍱 Plan: *${params.plan}* (${params.mealTime}, ${params.diet})\n` +
      `🌿 Diet: ${params.diet}\n\n` +
      `*Items:*\n${itemLines}\n\n` +
      `Deliver to:\n${params.address}\n\n` +
      `Base price: ${formatINR(params.basePrice)}\n` +
      (params.extraPrice > 0 ? `Add-ons: +${formatINR(params.extraPrice)}\n` : '') +
      `*Total: ${formatINR(params.total)}*\n\n` +
      `Reply *YES* to confirm, *EDIT* to change, or *CANCEL* to abort.`
    );
  },

  paymentLink: (amount: number, payUrl?: string) =>
    `💳 Please pay *${formatINR(amount)}* to confirm your order.\n\n` +
    (payUrl ? `Pay online: ${payUrl}\n\nOr ` : '') +
    `scan the UPI QR image sent above.`,

  paid: (orderCode: string) =>
    `✅ Payment received! Your order *${orderCode}* is being prepared.\nWe'll notify you when it's out for delivery. 🛵`,

  preparing: (orderCode: string) => `👨‍🍳 Your order *${orderCode}* is being prepared.`,
  outForDelivery: (orderCode: string) => `🛵 Your order *${orderCode}* is out for delivery!`,
  delivered: (orderCode: string) =>
    `🎉 Your order *${orderCode}* has been delivered. Enjoy your meal!\n\nThank you for choosing ThaliMate ❤️\nReply with a rating *1–5* to share your feedback.`,

  feedbackThanks: () => `🙏 Thanks for your feedback!`,
  cancelled: () => `Your order has been cancelled. Reply *Hi* anytime to start a new order.`,
  unknown: () =>
    `I didn't understand that 🤔\nReply *Hi* to start a new order or *menu* to see today's menu.`,
};
