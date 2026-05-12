/**
 * Conversation Finite State Machine for WhatsApp ordering.
 *
 * State is persisted in `Conversation.state` and `Conversation.context`.
 * The handler is intentionally pure: it returns the next state, context,
 * and outbound messages. Side-effects (DB writes, sends) happen in the caller.
 */
import type { ConversationContext, DietT, MealTimeT, SavedAddressLite } from '@thalimate/shared';
import { t } from './templates';

export type FsmState =
  | 'IDLE'
  | 'GREETING'
  | 'AWAITING_NAME'
  | 'AWAITING_MEAL_TIME'
  | 'AWAITING_PLAN'
  | 'AWAITING_DIET'
  | 'CUSTOMIZING'
  | 'AWAITING_ADDRESS_CHOICE'
  | 'AWAITING_ADDRESS'
  | 'AWAITING_NOTES'
  | 'AWAITING_CONFIRMATION'
  | 'AWAITING_PAYMENT'
  | 'COMPLETED';

export interface MenuSection {
  title: string;
  items: Array<{ idx: number; id: string; name: string; price?: number }>;
  includedCount?: number;
}

export interface FsmInput {
  text: string;
  state: FsmState;
  context: ConversationContext;
  customerName?: string;
  isReturning?: boolean;
  savedAddresses?: SavedAddressLite[];
  menuSections?: MenuSection[];
  plans?: Array<{ id: string; code: string; name: string; basePrice: number }>;
  planRules?: Record<string, number>;
  deliveryFee?: number;
}

export interface FsmOutput {
  nextState: FsmState;
  context: ConversationContext;
  reply: string;
  action?:
    | { kind: 'CREATE_DRAFT_ORDER' }
    | { kind: 'PLACE_ORDER_AND_REQUEST_PAYMENT' }
    | { kind: 'CANCEL_ORDER' }
    | { kind: 'SAVE_ADDRESS'; raw: string }
    | { kind: 'USE_SAVED_ADDRESS'; addressId: string }
    | { kind: 'SAVE_CUSTOMER_NAME'; name: string }
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
    if (!input.customerName) {
      return { nextState: 'AWAITING_NAME', context: {}, reply: t.askName() };
    }
    return {
      nextState: 'AWAITING_MEAL_TIME',
      context: {},
      reply: t.greeting(input.customerName, input.isReturning),
    };
  }

  switch (state) {
    case 'AWAITING_NAME': {
      const name = text.slice(0, 60).trim();
      if (name.length < 2) return reprompt(state, context, t.askName());
      return {
        nextState: 'AWAITING_MEAL_TIME',
        context: {},
        reply: t.greeting(name, false),
        action: { kind: 'SAVE_CUSTOMER_NAME', name },
      };
    }

    case 'AWAITING_MEAL_TIME': {
      const choice = parseChoice(lower, ['1', '2', 'lunch', 'dinner']);
      if (!choice) return reprompt(state, context, t.greeting(input.customerName, input.isReturning));
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
      if (lower === 'menu') {
        return {
          nextState: 'CUSTOMIZING',
          context,
          reply: input.menuSections ? t.showMenu(input.menuSections) : 'No menu available.',
        };
      }
      if (lower === 'done') {
        const sel = context.selections ?? {};
        const hasItems = Object.values(sel).some((q) => q > 0);
        if (!hasItems) return reprompt(state, context, 'Please select at least one item before typing *done*.');
        const savedAddrs = input.savedAddresses ?? [];
        if (savedAddrs.length > 0) {
          const ids = savedAddrs.map((a) => a.id);
          return {
            nextState: 'AWAITING_ADDRESS_CHOICE',
            context: { ...context, savedAddressIds: ids },
            reply: t.askAddressChoice(savedAddrs),
          };
        }
        return { nextState: 'AWAITING_ADDRESS', context, reply: t.askAddress() };
      }

      const removeMatch = lower.match(/^remove\s+(\d+)$/);
      if (removeMatch) {
        const removeIdx = parseInt(removeMatch[1]!, 10);
        const idxMap = buildIdxMap(input.menuSections ?? []);
        const item = idxMap.get(removeIdx);
        if (!item) return reprompt(state, context, `Item ${removeIdx} not found. Check the menu and try again.`);
        const selections = { ...(context.selections ?? {}) };
        delete selections[item.id];
        const rt = buildRunningTotal(selections, input.menuSections ?? [], input.planRules ?? {});
        return {
          nextState: 'CUSTOMIZING',
          context: { ...context, selections },
          reply: t.selectionUpdate([`${item.name} removed`], rt.lines, rt.extraPaise, input.deliveryFee),
        };
      }

      const updates = parseSelections(text);
      if (!updates) {
        return reprompt(
          state,
          context,
          'Reply with item numbers e.g. `1,4,7` or `2x2` for quantity, `2x0` to remove.\nType *menu* to see menu again, *done* when finished.',
        );
      }
      const selections = { ...(context.selections ?? {}) };
      const idxMap = buildIdxMap(input.menuSections ?? []);
      const addedNames: string[] = [];
      for (const [idx, qty] of updates) {
        const item = idxMap.get(idx);
        if (!item) continue;
        if (qty === 0) {
          delete selections[item.id];
          addedNames.push(`${item.name} removed`);
        } else {
          selections[item.id] = qty;
          addedNames.push(qty > 1 ? `${item.name} x${qty}` : item.name);
        }
      }
      const rt = buildRunningTotal(selections, input.menuSections ?? [], input.planRules ?? {});
      return {
        nextState: 'CUSTOMIZING',
        context: { ...context, selections },
        reply: t.selectionUpdate(addedNames, rt.lines, rt.extraPaise, input.deliveryFee),
      };
    }

    case 'AWAITING_ADDRESS_CHOICE': {
      const savedAddrs = input.savedAddresses ?? [];
      const savedIds = context.savedAddressIds ?? savedAddrs.map((a) => a.id);
      if (/^(new|n)$/i.test(lower)) {
        return { nextState: 'AWAITING_ADDRESS', context, reply: t.askAddress() };
      }
      const choiceIdx = parseInt(lower, 10);
      if (Number.isFinite(choiceIdx) && choiceIdx >= 1 && choiceIdx <= savedIds.length) {
        const addressId = savedIds[choiceIdx - 1]!;
        return {
          nextState: 'AWAITING_NOTES',
          context: { ...context, addressId },
          reply: t.askNotes(),
          action: { kind: 'USE_SAVED_ADDRESS', addressId },
        };
      }
      return reprompt(state, context, t.askAddressChoice(savedAddrs.length > 0 ? savedAddrs : []));
    }

    case 'AWAITING_ADDRESS': {
      if (text.length < 8) return reprompt(state, context, t.askAddress());
      return {
        nextState: 'AWAITING_NOTES',
        context,
        reply: t.askNotes(),
        action: { kind: 'SAVE_ADDRESS', raw: text },
      };
    }

    case 'AWAITING_NOTES': {
      const skipWords = /^(no|none|skip|nope|na|nil|-|nothing)$/i;
      const notes = skipWords.test(lower) ? undefined : text.slice(0, 300);
      return {
        nextState: 'AWAITING_CONFIRMATION',
        context: { ...context, notes },
        reply: 'Preparing your order summary...',
      };
    }

    case 'AWAITING_CONFIRMATION': {
      if (/^(yes|y|confirm|ok|okay|haan|ha)$/i.test(lower)) {
        return {
          nextState: 'AWAITING_PAYMENT',
          context,
          reply: 'Generating your payment...',
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
      if (/^address/i.test(lower)) {
        const savedAddrs = input.savedAddresses ?? [];
        if (savedAddrs.length > 0) {
          const ids = savedAddrs.map((a) => a.id);
          return {
            nextState: 'AWAITING_ADDRESS_CHOICE',
            context: { ...context, savedAddressIds: ids },
            reply: t.askAddressChoice(savedAddrs),
          };
        }
        return { nextState: 'AWAITING_ADDRESS', context, reply: t.askAddress() };
      }
      return reprompt(state, context, 'Reply *YES* to confirm, *EDIT* to change items, *ADDRESS* to change delivery address, or *CANCEL* to abort.');
    }

    case 'AWAITING_PAYMENT': {
      return {
        nextState: 'AWAITING_PAYMENT',
        context,
        reply: 'Waiting for your payment. We will confirm as soon as it is received. Please check your UPI app.',
      };
    }

    default:
      return { nextState: 'IDLE', context: {}, reply: t.unknown() };
  }
}

function reprompt(state: FsmState, context: ConversationContext, msg: string): FsmOutput {
  return { nextState: state, context, reply: msg };
}

function buildIdxMap(sections: MenuSection[]): Map<number, { id: string; name: string; price?: number; category: string }> {
  const map = new Map<number, { id: string; name: string; price?: number; category: string }>();
  sections.forEach((s) =>
    s.items.forEach((i) => map.set(i.idx, { id: i.id, name: i.name, price: i.price, category: s.title })),
  );
  return map;
}

function buildRunningTotal(
  selections: Record<string, number>,
  sections: MenuSection[],
  planRules: Record<string, number>,
): { lines: Array<{ name: string; qty: number; free: boolean }>; extraPaise: number } {
  const itemMap = new Map<string, { name: string; price: number; category: string }>();
  sections.forEach((s) =>
    s.items.forEach((i) =>
      itemMap.set(i.id, { name: i.name, price: i.price ?? 0, category: s.title.toLowerCase() }),
    ),
  );

  const catCount: Record<string, number> = {};
  const lines: Array<{ name: string; qty: number; free: boolean }> = [];
  let extraPaise = 0;

  for (const [id, qty] of Object.entries(selections)) {
    const item = itemMap.get(id);
    if (!item || qty <= 0) continue;
    const cat = item.category;
    catCount[cat] = catCount[cat] ?? 0;
    const freeAllowed = planRules[cat] ?? 0;
    const alreadyUsed = catCount[cat];
    const freeHere = Math.max(0, freeAllowed - alreadyUsed);
    const paidQty = Math.max(0, qty - freeHere);
    catCount[cat] += qty;
    extraPaise += paidQty * item.price;
    lines.push({ name: item.name, qty, free: paidQty === 0 });
  }

  return { lines, extraPaise };
}

function parseChoice(text: string, allowed: string[]): string | null {
  const tok = text.trim().toLowerCase();
  return allowed.find((a) => tok === a) ?? null;
}

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
    const qty = m[2] !== undefined ? parseInt(m[2], 10) : 1;
    if (!Number.isFinite(idx) || !Number.isFinite(qty) || qty < 0 || qty > 50) return null;
    out.push([idx, qty]);
  }
  return out.length > 0 ? out : null;
}
