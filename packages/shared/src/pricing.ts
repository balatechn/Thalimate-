import {
  DEFAULT_DELIVERY_FEE,
  FREE_DELIVERY_THRESHOLD,
  TAX_RATE,
} from './constants';
import type {
  MealPlanLite,
  MenuItemLite,
  OrderLineInput,
  PriceBreakdown,
} from './types';

export interface CouponInput {
  type: 'PERCENT' | 'FLAT';
  value: number;
  minOrder?: number;
  maxDiscount?: number;
}

/**
 * Pricing engine. All amounts in paise. Pure & deterministic.
 */
export function calculatePrice(opts: {
  plan: MealPlanLite;
  lines: OrderLineInput[];
  menuItems: MenuItemLite[];
  coupon?: CouponInput | null;
  taxRate?: number;
  deliveryFee?: number;
}): PriceBreakdown & { lineTotals: Array<{ menuItemId: string; total: number }> } {
  const itemMap = new Map(opts.menuItems.map((m) => [m.id, m]));
  let extras = 0;
  const lineTotals: Array<{ menuItemId: string; total: number }> = [];

  for (const line of opts.lines) {
    const item = itemMap.get(line.menuItemId);
    if (!item) continue;
    const total = item.price * Math.max(0, line.quantity);
    extras += total;
    lineTotals.push({ menuItemId: line.menuItemId, total });
  }

  const subtotal = opts.plan.basePrice + extras;

  // Coupon
  let discount = 0;
  if (opts.coupon && subtotal >= (opts.coupon.minOrder ?? 0)) {
    if (opts.coupon.type === 'PERCENT') {
      discount = Math.floor((subtotal * opts.coupon.value) / 100);
    } else {
      discount = opts.coupon.value;
    }
    if (opts.coupon.maxDiscount) discount = Math.min(discount, opts.coupon.maxDiscount);
    discount = Math.min(discount, subtotal);
  }

  const taxableBase = subtotal - discount;
  const taxRate = opts.taxRate ?? TAX_RATE;
  const taxAmount = Math.round((taxableBase * taxRate) / 100);

  const deliveryFee =
    opts.deliveryFee ??
    (taxableBase >= FREE_DELIVERY_THRESHOLD ? 0 : DEFAULT_DELIVERY_FEE);

  const total = taxableBase + taxAmount + deliveryFee;

  return { subtotal, taxAmount, deliveryFee, discount, total, lineTotals };
}

/**
 * Validate selections against meal plan rules.
 * Returns array of validation errors.
 */
export function validateSelections(opts: {
  plan: MealPlanLite;
  lines: OrderLineInput[];
  menuItems: MenuItemLite[];
}): string[] {
  const errors: string[] = [];
  const itemMap = new Map(opts.menuItems.map((m) => [m.id, m]));
  const counts: Record<string, number> = {};
  for (const line of opts.lines) {
    if (line.isAddOn) continue;
    const item = itemMap.get(line.menuItemId);
    if (!item) continue;
    const cat = item.category.toLowerCase();
    counts[cat] = (counts[cat] ?? 0) + line.quantity;
  }

  const rules = opts.plan.rules;
  for (const [k, required] of Object.entries(rules) as Array<[keyof typeof rules, number]>) {
    if (required > 0 && (counts[k] ?? 0) < required) {
      errors.push(`Please select ${required} ${k}`);
    }
  }
  return errors;
}
