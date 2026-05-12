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

export interface FsmInput {
  text: string;
  state: FsmState;
  context: ConversationContext;
  customerName?: string;
  /** Catalog data fetched by the caller for the current diet/mealtime */
  menuSections?: Array<{ title: string; items: Array<{ idx: number; id: string; name: string; price?: number }> }>;
  /** Fetched plans (for plan selection) */
  plans?: Array<{ id: string; code: string; name: string; basePrice: number }>;
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

const TRIGGERS = /^(hi|hello|hey|menu|order|start)\b/i;

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
        reply: t.askPlan(),
      };
    }

    case 'AWAITING_PLAN': {
      const idx = parseInt(lower, 10);
      const plans = input.plans ?? [];
      const plan = plans[idx - 1];
      if (!plan) return reprompt(state, context, t.askPlan());
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
        return { nextState: 'AWAITING_PLAN', context: { ...context, selections: {} }, reply: t.askPlan() };
      }
      if (lower === 'done') {
        return {
          nextState: 'AWAITING_ADDRESS',
          context,
          reply: t.askAddress(),
        };
      }
      const updates = parseSelections(text);
      if (!updates) return reprompt(state, context, 'Please reply with item numbers, e.g. `1,4,7` or `1x2,4`. Type *done* when finished.');
      const selections = { ...(context.selections ?? {}) };
      // Map idx -> menuItemId via menuSections
      const idToIdx = new Map<number, string>();
      (input.menuSections ?? []).forEach((s) =>
        s.items.forEach((i) => idToIdx.set(i.idx, i.id)),
      );
      for (const [idx, qty] of updates) {
        const id = idToIdx.get(idx);
        if (!id) continue;
        selections[id] = (selections[id] ?? 0) + qty;
      }
      return {
        nextState: 'CUSTOMIZING',
        context: { ...context, selections },
        reply: `Added. Current items: ${Object.values(selections).reduce((a, b) => a + b, 0)}.\nType more numbers, *done* when finished, or *back* to change plan.`,
      };
    }

    case 'AWAITING_ADDRESS': {
      if (text.length < 8) return reprompt(state, context, t.askAddress());
      return {
        nextState: 'AWAITING_CONFIRMATION',
        context: { ...context, notes: text },
        reply: 'Got it. Preparing your order summary…',
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
