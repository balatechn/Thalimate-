import { prisma, type Order, type OrderStatus, type Customer, type Address, type MealPlan } from '@thalimate/db';
import {
  calculatePrice,
  generateOrderCode,
  todayISTDateOnly,
  type CreateOrderInput,
} from '@thalimate/shared';

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const [plan, menuItems, coupon] = await Promise.all([
    prisma.mealPlan.findUniqueOrThrow({ where: { id: input.planId } }),
    prisma.menuItem.findMany({ where: { id: { in: input.lines.map((l) => l.menuItemId) } } }),
    input.couponCode
      ? prisma.coupon.findUnique({ where: { code: input.couponCode } })
      : Promise.resolve(null),
  ]);

  const breakdown = calculatePrice({
    plan: {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      basePrice: plan.basePrice,
      rules: plan.rules as never,
    },
    lines: input.lines,
    menuItems: menuItems.map((m) => ({
      id: m.id,
      name: m.name,
      category: m.category,
      diet: m.diet,
      price: m.price,
    })),
    coupon: coupon
      ? {
          type: coupon.type,
          value: coupon.value,
          minOrder: coupon.minOrder,
          maxDiscount: coupon.maxDiscount ?? undefined,
        }
      : null,
  });

  // Sequence order code per IST day
  const today = todayISTDateOnly();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const seq = (await prisma.order.count({
    where: { createdAt: { gte: today, lt: tomorrow } },
  })) + 1;

  const order = await prisma.order.create({
    data: {
      code: generateOrderCode(seq),
      customerId: input.customerId,
      addressId: input.addressId,
      planId: input.planId,
      mealTime: input.mealTime,
      diet: input.diet,
      subtotal: breakdown.subtotal,
      taxAmount: breakdown.taxAmount,
      deliveryFee: breakdown.deliveryFee,
      discount: breakdown.discount,
      total: breakdown.total,
      couponCode: input.couponCode,
      notes: input.notes,
      scheduledFor: input.scheduledFor,
      items: {
        create: input.lines
          .map((l) => {
            const mi = menuItems.find((m) => m.id === l.menuItemId);
            if (!mi) return null;
            return {
              menuItemId: mi.id,
              name: mi.name,
              category: mi.category,
              unitPrice: mi.price,
              quantity: l.quantity,
              isAddOn: l.isAddOn ?? false,
              total: mi.price * l.quantity,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null),
      },
    },
  });

  return order;
}

export async function transitionOrder(orderId: string, status: OrderStatus, extra: Partial<Order> = {}) {
  return prisma.order.update({
    where: { id: orderId },
    data: { status, ...extra },
  });
}

export type OrderWithRelations = Order & {
  customer: Customer;
  address: Address | null;
  plan: MealPlan | null;
  items: Awaited<ReturnType<typeof prisma.orderItem.findMany>>;
};
