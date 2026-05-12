# ThaliMate Architecture

## High-level Diagram

```
                    ┌────────────────┐
   Customer ──WA──▶│ Evolution API  │──webhook──▶ Next.js /api/webhooks/whatsapp
                    └────────────────┘                          │
                                                                ▼
                                                       Conversation FSM
                                                       (packages/whatsapp)
                                                                │
                          ┌─────────────────────────────────────┼─────────────────┐
                          ▼                                     ▼                 ▼
                  PostgreSQL (Prisma)                 Redis (BullMQ)        n8n workflows
                  - customers, orders                 - notifications        - menu broadcast
                  - menus, plans                      - follow-ups           - feedback DM
                  - conversations (FSM)               - campaigns            - integrations
                          ▲                                     │
                          │                                     ▼
                          │                        apps/worker (BullMQ)
                          │                       - sends WhatsApp messages
                          │                       - schedules feedback
                          │                       - paces campaigns
                          │
                  Admin Dashboard (Next.js)
                  - shadcn/ui + Tailwind
                  - JWT cookie + RBAC
                  - Kitchen + Delivery views
```

## Modules

### Conversation FSM (`packages/whatsapp/src/fsm.ts`)

Pure function `handleMessage(input)` returning `{ nextState, context, reply, action? }`.
Side-effects (DB, sends) executed by `apps/web/src/lib/whatsapp-handler.ts`.

States: `IDLE → AWAITING_MEAL_TIME → AWAITING_PLAN → AWAITING_DIET → CUSTOMIZING → AWAITING_ADDRESS → AWAITING_CONFIRMATION → AWAITING_PAYMENT → COMPLETED`.

Triggers: `Hi`, `Hello`, `Menu`, `Order`, `Start` reset to greeting.
`cancel` aborts at any time.

### Pricing Engine (`packages/shared/src/pricing.ts`)

Pure, deterministic function:

```
total = (plan.basePrice + Σ extras) − discount + tax + delivery
```

Coupons: PERCENT/FLAT, `minOrder`, `maxDiscount` cap.
Free delivery above `FREE_DELIVERY_THRESHOLD` (₹500 default).
All amounts in **paise** (integer) to avoid float drift.

### Order Lifecycle

```
PENDING_PAYMENT → PAID → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED
                            ↘  CANCELLED  ↙
                            ↘  REFUNDED   ↙
```

Each transition enqueues a notification job via BullMQ.

### Webhook Security

- Evolution → HMAC-SHA256 (`x-hub-signature-256`) using `EVOLUTION_WEBHOOK_SECRET`
- Razorpay → HMAC-SHA256 (`x-razorpay-signature`) using `RAZORPAY_WEBHOOK_SECRET`
- Per-phone rate-limit: 30 messages / minute (sliding window in Redis)
- Per-IP login rate-limit: 10 attempts / minute

### Authentication

- `jose` JWT signed HS256, stored in HttpOnly `tm_session` cookie (7-day exp)
- Roles: `ADMIN`, `KITCHEN`, `DELIVERY`, `SUPPORT`
- Middleware (`src/middleware.ts`) gates `/admin`, `/kitchen`, `/delivery`
- API routes call `requireRole(session, [...])`

### Scalability

- **Stateless web tier** → horizontal scale behind Traefik
- **BullMQ workers** → multiple replicas, automatic retries + exponential backoff
- **Redis** for FSM cache, rate-limit, queues
- **Postgres** indexed on `(status, createdAt)`, `(customerId)`, `(date, mealTime, diet)`
- **Pacing**: campaigns send with 1.5s gap to avoid WhatsApp bans

### Storage

Abstracted via `STORAGE_DRIVER=local|s3`. Local writes to `STORAGE_LOCAL_DIR`, S3 driver targets any S3-compatible (MinIO/AWS/R2). Menu images uploaded via signed URLs.

## Tech Choices

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 15 App Router | SSR, RSC, API routes in one codebase |
| ORM | Prisma 5 | Type-safe migrations + schema clarity |
| Validation | Zod | Single schema for runtime + TS types |
| Queue | BullMQ | Reliable retries, delays, repeat jobs |
| WhatsApp | Evolution API | Self-hosted, no Meta gatekeeping |
| Payments | Razorpay + UPI QR | Indian market default + offline fallback |
| Auth | JWT (jose) | Stateless, Edge-compatible |
| UI | Tailwind + shadcn/ui | Fast, customizable, accessible |
| Logs | Pino | Fast structured JSON logs |
| Deploy | Coolify | Docker on VPS without K8s overhead |

## Data Model Highlights

- **Money in paise** everywhere → no floats.
- `Order.code` is human-readable (`TM-YYYYMMDD-NNNN`), unique.
- `Conversation.context` is `Json` — flexible without migrations during FSM evolution.
- `MealPlan.rules` (Json) lets admins define per-plan composition rules without code changes.
- `DailyMenu` keyed `(date, mealTime, diet)` ensures one canonical menu per slot.

## Future Enhancements

- WebSocket push to admin dashboard for live order updates
- Subscription plans (weekly/monthly thali)
- Loyalty points
- Multi-tenant SaaS mode
- WhatsApp Catalog API integration
