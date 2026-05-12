# WhatsApp Conversation Flow

## Triggers (any state → restart)

`hi`, `hello`, `hey`, `menu`, `order`, `start`

## Universal commands

- `cancel` → abort current order, reset to IDLE

## Flow

```
[IDLE]
  user: "Hi"
  bot:  "Welcome to ThaliMate 🍱  1️⃣ Lunch  2️⃣ Dinner"
[AWAITING_MEAL_TIME]
  user: "1"
  bot:  "Choose Meal Box: 1 Daily Delight ₹149  2 Premium ₹199  3 Signature ₹269"
[AWAITING_PLAN]
  user: "2"
  bot:  "Diet preference? 1 Regular  2 Jain"
[AWAITING_DIET]
  user: "2"
  bot:  Sends menu grouped by category with numbered items.
[CUSTOMIZING]
  user: "1,4,7" or "1x2,4"   (multi-select with quantities)
  bot:  Confirms additions, prompts for more or `done` / `back`.
  user: "done"
  bot:  Asks for delivery address.
[AWAITING_ADDRESS]
  user: <free text>
  bot:  Builds order summary with total + ETA.
[AWAITING_CONFIRMATION]
  user: "YES"
  bot:  Generates payment (Razorpay link or UPI QR).
[AWAITING_PAYMENT]
  webhook: payment received
  bot:  "✅ Payment received. Order TM-20260511-0012 is being prepared."
[COMPLETED]
```

## Status updates (asynchronous, pushed by worker)

- 👨‍🍳 PREPARING
- 🛵 OUT_FOR_DELIVERY
- 🎉 DELIVERED → followed (after 2h) by feedback request

## Edge cases

| Input | Behavior |
|---|---|
| Invalid choice | Bot re-prompts with same question |
| `back` in CUSTOMIZING | Returns to plan selection, keeps meal time |
| `cancel` anywhere | Order cancelled, conversation reset |
| Unknown message in IDLE | Treated as a new greeting |
| Customer sends mid-payment | Bot acknowledges payment is being awaited |

## Implementation

- `packages/whatsapp/src/fsm.ts` — pure FSM
- `apps/web/src/lib/whatsapp-handler.ts` — side-effects, DB persistence, payment generation
- `apps/web/src/app/api/webhooks/whatsapp/route.ts` — webhook receiver
