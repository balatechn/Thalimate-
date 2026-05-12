/**
 * Conversation Finite State Machine for WhatsApp ordering.
 *
 * State is persisted in `Conversation.state` and `Conversation.context`.
 * The handler is intentionally pure: it returns the next state, context,
 * and outbound messages. Side-effects (DB writes, sends) happen in the caller.
 */
import type { ConversationContext, DietT, MealTimeT } from '@thalimate/shared';
import { t } from './templates';

export type FsmState =
  | 'IDLE'
  | 'GREETING'
  | 'AWAITING_MEAL_TIME'
  | 'AWAITING_PLAN'
  | 'AWAITING_DIET'
  | 'CUSTOMIZING'
  | 'AWAITING_ADDRESS'
  | 'AWAITING_CONFIRMATION'
  | 'AWAITING_PAYMENT'
  | 'COMPLETED';

export interface MenuSection {
  title: string;
  items: Array<{ idx: number; id: string; name: string; price?: number }>;
  includedCount?: number; // how many of this category are covered by the plan
}

export interface FsmInput {
  text: string;
  state: FsmState;
  context: ConversationContext;
  customerName?: string;
  /** Catalog data fetched by the caller for the current diet/mealtime */
  menuSections?: MenuSection[];
  /** Fetched plans (for plan selection) */
  plans?: Array<{ id: string; code: string; name: string; basePrice: number }>;
  /** Rules of the selected plan — determines free vs add-on items */
  planRules?: Record<string, number>; // category.toLowerCase() -> free qty
}

export interface FsmOutput {
  nextState: FsmState;
  context: ConversationContext;
  reply: string;
  /** Hints for caller to perform actions */
  action?:
    | { kind: 'CREATE_DRAFT_ORDER' }
    | { kind: 'PLACE_ORDER_AND_REQUEST_PAYMENT' }
    | { kind: 'CANCEL_ORDER' }
    | { kind: 'SAVE_ADDRESS'; raw: string }
    | { kind: 'CAPTURE_FEEDBACK'; rating: number };
}

const TRIGGERS = /^(hi|hello|hey|menu|order|start|thali)\b/i;

export function handleMessage(input: FsmInput): FsmOutput {
  const text = (input.text ?? '').trim();
  const lower = text.toLowerCase();
  let { state, context } = input;

  if (lower === 'cancel') {
    return {
      nextState: 'IDLE',
      context: {},
      reply: t.cancelled(),
      action: context.draftOrderId ? { kind: 'CANCEL_ORDER' } : undefined,
    };
  }

  if (TRIGGERS.test(lower) || state === 'IDLE' || state === 'COMPLETED') {
    return {
      nextState: 'AWAITING_MEAL_TIME',
      context: {},
      reply: t.greeting(input.customerName),
    };
  }

  switch (state) {
    case 'AWAITING_MEAL_TIME': {
      const choice = parseChoice(lower, ['1', '2', 'lunch', 'dinner']);
      if (!choice) return reprompt(state, context, t.greeting(input.customerName));
      const mealTime: MealTimeT = choice === '1' || choice === 'lunch' ? 'LUNCH' : 'DINNER';
      return {
        nextState: 'AWAITING_PLAN',
        context: { ...context, mealTime },
        reply: t.askPlan(input.plans ?? []),
      };
    }

    case 'AWAITING_PLAN': {
      const idx = parseInt(lower, 10);
      const plans = input.plans ?? [];
      const plan = plans[idx - 1];
      if (!plan) return reprompt(state, context, t.askPlan(plans));
      return {
        nextState: 'AWAITING_DIET',
        context: { ...context, planCode: plan.code },
        reply: t.askDiet(),
      };
    }

    case 'AWAITING_DIET': {
      const choice = parseChoice(lower, ['1', '2', 'regular', 'jain']);
      if (!choice) return reprompt(state, context, t.askDiet());
      const diet: DietT = choice === '1' || choice === 'regular' ? 'REGULAR' : 'JAIN';
      return {
        nextState: 'CUSTOMIZING',
        context: { ...context, diet, selections: {} },
        reply: input.menuSections
          ? t.showMenu(input.menuSections)
          : 'Sorry, no menu published for this slot. Please try again later.',
      };
    }

    case 'CUSTOMIZING': {
      if (lower === 'back') {
        return { nextState: 'AWAITING_PLAN', context: { ...context, selections: {} }, reply: t.askPlan(input.plans ?? []) };
      }
      if (lower === 'done') {
        if (!context.selections || Object.keys(context.selections).length === 0) {
          return reprompt(state, context, 'Please select at least one item before typing *done*.');
        }
        return {
          nextState: 'AWAITING_ADDRESS',
          context,
          reply: t.askAddress(),
        };
      }
      const updates = parseSelections(text);
      if (!updates) return reprompt(state, context, 'Please reply with item numbers, e.g. `1,4,7` or `1x2,4`. Type *done* when finished.');
      const selections = { ...(context.selections ?? {}) };
      // Build idx -> {id, name, price, category} map
      const idxMap = new Map<number, { id: string; name: string; price?: number; category: string }>();
      (input.menuSections ?? []).forEach((s) =>
        s.items.forEach((i) => idxMap.set(i.idx, { id: i.id, name: i.name, price: i.price, category: s.title })),
      );
      const addedNames: string[] = [];
      for (const [idx, qty] of updates) {
        const item = idxMap.get(idx);
        if (!item) continue;
        selections[item.id] = (selections[item.id] ?? 0) + qty;
        addedNames.push(qty > 1 ? `${item.name} ×${qty}` : item.name);
      }
      // Build running total with plan-rules awareness
      const runningTotal = buildRunningTotal(selections, input.menuSections ?? [], input.planRules ?? {});
      return {
        nextState: 'CUSTOMIZING',
        context: { ...context, selections },
        reply: t.selectionUpdate(addedNames, runningTotal.lines, runningTotal.extraPaise),
      };
    }

    case 'AWAITING_ADDRESS': {
      if (text.length < 8) return reprompt(state, context, t.askAddress());
      return {
        nextState: 'AWAITING_CONFIRMATION',
        context: { ...context, notes: text },
        reply: '✅ Got it! Preparing your order summary…',
        action: { kind: 'SAVE_ADDRESS', raw: text },
      };
    }

    case 'AWAITING_CONFIRMATION': {
      if (/^yes|^y$|confirm/i.test(lower)) {
        return {
          nextState: 'AWAITING_PAYMENT',
          context,
          reply: 'Generating your payment…',
          action: { kind: 'PLACE_ORDER_AND_REQUEST_PAYMENT' },
        };
      }
      if (/^edit/i.test(lower)) {
        return {
          nextState: 'CUSTOMIZING',
          context,
          reply: input.menuSections ? t.showMenu(input.menuSections) : 'Edit your selection.',
        };
      }
      return reprompt(state, context, 'Reply *YES* to confirm, *EDIT* to change, or *CANCEL*.');
    }

    case 'AWAITING_PAYMENT': {
      // Customer messages during payment wait — usually status check
      return {
        nextState: 'AWAITING_PAYMENT',
        context,
        reply: 'Waiting for your payment. We will confirm as soon as it is received.',
      };
    }

    default:
      return { nextState: 'IDLE', context: {}, reply: t.unknown() };
  }
}

function reprompt(state: FsmState, context: ConversationContext, msg: string): FsmOutput {
  return { nextState: state, context, reply: msg };
}

/** Compute running extra cost given current selections, menu sections, and plan rules. */
function buildRunningTotal(
  selections: Record<string, number>,
  sections: MenuSection[],
  planRules: Record<string, number>,
): { lines: Array<{ name: string; qty: number; free: boolean }>; extraPaise: number } {
  // Build id -> {name, price, category} lookup
  const itemMap = new Map<string, { name: string; price: number; category: string }>();
  sections.forEach((s) => s.items.forEach((i) => itemMap.set(i.id, { name: i.name, price: i.price ?? 0, category: s.title.toLowerCase() })));

  // Count how many of each category have been selected
  const catCount: Record<string, number> = {};
  const lines: Array<{ name: string; qty: number; free: boolean }> = [];
  let extraPaise = 0;

  for (const [id, qty] of Object.entries(selections)) {
    const item = itemMap.get(id);
    if (!item || qty <= 0) continue;
    const cat = item.category;
    catCount[cat] = (catCount[cat] ?? 0);
    const freeAllowed = planRules[cat] ?? 0;
    const alreadyUsed = catCount[cat];
    const freeHere = Math.max(0, freeAllowed - alreadyUsed);
    const paidQty = Math.max(0, qty - freeHere);
    catCount[cat] += qty;
    const isFree = paidQty === 0 && item.price === 0;
    extraPaise += paidQty * item.price;
    lines.push({ name: item.name, qty, free: isFree });
  }

  return { lines, extraPaise };
}

function parseChoice(text: string, allowed: string[]): string | null {
  const tok = text.trim().toLowerCase();
  return allowed.find((a) => tok === a) ?? null;
}

/** Parse selections like "1,4,7" or "1x2, 4, 7x3" -> [[1,1],[4,1],[7,1]] / quantities. */
export function parseSelections(text: string): Array<[number, number]> | null {
  const parts = text
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const out: Array<[number, number]> = [];
  for (const p of parts) {
    const m = p.match(/^(\d+)(?:[x*](\d+))?$/i);
    if (!m) return null;
    const idx = parseInt(m[1]!, 10);
    const qty = m[2] ? parseInt(m[2], 10) : 1;
    if (!Number.isFinite(idx) || !Number.isFinite(qty) || qty < 1 || qty > 50) return null;
    out.push([idx, qty]);
  }
  return out;
}
