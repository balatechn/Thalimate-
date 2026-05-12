import { formatINR } from '@thalimate/shared';

export const t = {
  greeting: (name?: string) =>
    `Welcome to *ThaliMate* 🍱\n${name ? `Hi ${name}! ` : ''}Please choose your meal type:\n\n1️⃣ Lunch\n2️⃣ Dinner\n\nReply with 1 or 2.`,

  askPlan: () =>
    `Great! Please choose your *Meal Box*:\n\n1️⃣ Daily Delight — ₹149\n2️⃣ Premium — ₹199\n3️⃣ Signature — ₹269\n\nReply with 1, 2 or 3.`,

  askDiet: () => `Choose your *dietary preference*:\n\n1️⃣ Regular\n2️⃣ Jain\n\nReply with 1 or 2.`,

  showMenu: (sections: Array<{ title: string; items: Array<{ idx: number; name: string; price?: number }> }>) => {
    const body = sections
      .map(
        (s) =>
          `*${s.title}*\n` +
          s.items
            .map(
              (i) => `${i.idx}. ${i.name}${i.price ? `  (+${formatINR(i.price)})` : ''}`,
            )
            .join('\n'),
      )
      .join('\n\n');
    return (
      `Pick items by replying with numbers separated by commas.\n` +
      `Example: \`1,4,7\` or \`1x2,4\` for quantities.\n\n${body}\n\n` +
      `Type *done* when finished, *back* to change plan, or *cancel* to abort.`
    );
  },

  askAddress: () =>
    `Please share your *delivery address*:\n\nFormat:\n_Name_\n_House / Flat, Street_\n_Landmark_\n_City - Pincode_`,

  confirmation: (params: {
    plan: string;
    items: string[];
    address: string;
    total: number;
    eta: string;
  }) =>
    `*Order Summary*\n\nPlan: ${params.plan}\nItems:\n${params.items.map((i) => ` • ${i}`).join('\n')}\n\nDeliver to:\n${params.address}\nETA: ${params.eta}\n\n*Total: ${formatINR(params.total)}*\n\nReply *YES* to confirm, *EDIT* to change, or *CANCEL*.`,

  paymentLink: (amount: number, qrUrl: string, payUrl?: string) =>
    `Please pay *${formatINR(amount)}* to confirm your order.\n\n${payUrl ? `Pay: ${payUrl}\n\n` : ''}Or scan the UPI QR (sent as image).`,

  paid: (orderCode: string) =>
    `✅ Payment received!\nYour order *${orderCode}* is being prepared. We'll notify you when it's out for delivery.`,

  preparing: (orderCode: string) => `👨‍🍳 Your order *${orderCode}* is being prepared.`,
  outForDelivery: (orderCode: string) => `🛵 Your order *${orderCode}* is out for delivery!`,
  delivered: (orderCode: string) =>
    `🎉 Your order *${orderCode}* has been delivered. Enjoy your meal!\n\nThank you for ordering from ThaliMate ❤️\nReply with a rating 1-5 to share your feedback.`,

  feedbackThanks: () => `Thanks for your feedback! 🙏`,
  cancelled: () => `Your order has been cancelled. Reply *Hi* anytime to start over.`,
  unknown: () => `I didn't understand that. Reply *Hi* to start over or *menu* to see today's menu.`,
};
