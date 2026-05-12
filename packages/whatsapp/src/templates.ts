import { formatINR, DEFAULT_DELIVERY_FEE } from '@thalimate/shared';
import type { MenuSection } from './fsm';
import type { SavedAddressLite } from '@thalimate/shared';

export const t = {
  askName: () =>
    `Welcome to *ThaliMate* 🍱\n\nI don't think we've met before! 😊\nWhat's your name?`,

  greeting: (name?: string, isReturning?: boolean) => {
    const welcome = isReturning
      ? `Welcome back, *${name}*! 👋`
      : `Hi *${name}*, welcome to *ThaliMate* 🍱`;
    return `${welcome}\n\nPlease choose your meal type:\n\n1️⃣ Lunch\n2️⃣ Dinner\n\nReply with *1* or *2*.`;
  },

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
    deliveryFee?: number,
  ) => {
    const changedStr = addedNames.length ? `✅ ${addedNames.join(', ')}\n\n` : '';
    const basket =
      lines.length === 0
        ? '_(empty)_'
        : lines.map((l) => `  • ${l.name} ×${l.qty}${l.free ? ' ✓' : ''}`).join('\n');
    const extraNote = extraPaise > 0 ? `\n💰 Add-ons: *+${formatINR(extraPaise)}*` : '';
    const fee = deliveryFee ?? DEFAULT_DELIVERY_FEE;
    const delivNote = fee > 0 ? `\n🛵 Delivery: *+${formatINR(fee)}*` : `\n🛵 Free delivery`;
    return (
      `${changedStr}*Your basket:*\n${basket}${extraNote}${delivNote}\n\n` +
      `Type more numbers, *menu* to see menu, *done* when finished, *remove N* to remove.`
    );
  },

  askAddressChoice: (addresses: SavedAddressLite[]) => {
    const nums = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
    const list = addresses
      .map((a, i) => `${nums[i] ?? `${i + 1}.`} ${a.label ? `*${a.label}* — ` : ''}${a.line1}, ${a.city} – ${a.pincode}`)
      .join('\n');
    return (
      `📍 *Choose delivery address:*\n\n${list}\n${nums[addresses.length] ?? `${addresses.length + 1}.`} Enter a new address\n\n` +
      `Reply with the number or *new* to enter a different address.`
    );
  },

  askNotes: () =>
    `📝 Any *special instructions*?\n_(e.g. extra spicy, no onion, gate code)_\n\nOr reply *skip* if none.`,

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
    deliveryFee: number;
    total: number;
    notes?: string;
    estimatedMins?: number;
  }) => {
    const itemLines = params.items
      .map((i) => ` • ${i.name} ×${i.qty}${i.addonPrice ? ` (+${formatINR(i.addonPrice)})` : ''}`)
      .join('\n');
    const eta = params.estimatedMins ? `\n⏱️ Est. delivery: *~${params.estimatedMins} mins*` : '';
    const notesLine = params.notes ? `\n📝 Notes: _${params.notes}_` : '';
    return (
      `*📋 Order Summary*\n\n` +
      `🍱 Plan: *${params.plan}*\n` +
      `⏰ Meal: ${params.mealTime}  🌿 Diet: ${params.diet}\n\n` +
      `*Items:*\n${itemLines}\n\n` +
      `📍 Deliver to:\n${params.address}${notesLine}${eta}\n\n` +
      `Base price:  ${formatINR(params.basePrice)}\n` +
      (params.extraPrice > 0 ? `Add-ons:     +${formatINR(params.extraPrice)}\n` : '') +
      (params.deliveryFee > 0 ? `Delivery:    +${formatINR(params.deliveryFee)}\n` : `Delivery:    FREE\n`) +
      `──────────────────\n` +
      `*Total: ${formatINR(params.total)}*\n\n` +
      `Reply *YES* to confirm, *EDIT* to change items, *ADDRESS* to change address, or *CANCEL* to abort.`
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
