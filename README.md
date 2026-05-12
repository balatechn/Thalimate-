# ThaliMate 🍱

Production-ready WhatsApp food ordering platform built with Next.js 15, TypeScript, Prisma, PostgreSQL, Redis, BullMQ, Evolution API and n8n.

## Features

- 💬 **WhatsApp-native ordering** via Evolution API + finite-state-machine
- 🍛 **Dynamic daily menus** (Lunch/Dinner × Regular/Jain × multiple categories)
- 💳 **Payments** — Razorpay UPI + native UPI QR fallback
- 👨‍🍳 **Kitchen workflow** with thermal-printer ticket
- 🛵 **Delivery board** with Google Maps deep-link
- 📣 **Marketing campaigns** with consent management & rate-pacing
- 📊 **Admin dashboard** (shadcn/ui, dark/light)
- 🔄 **BullMQ** worker for retries + scheduling
- 🤖 **n8n** workflows for broadcasts and follow-ups
- 🛡️ JWT auth, role-based access, HMAC webhook verification, rate limiting

## Project Structure

```
thalimate/
├── apps/
│   ├── web/          # Next.js 15 (App Router) — admin, API, customer pay page
│   └── worker/       # BullMQ workers (notifications, campaigns, follow-ups)
├── packages/
│   ├── db/           # Prisma schema + client
│   ├── shared/       # Zod schemas, types, pricing engine, formatters
│   └── whatsapp/     # Evolution API client + conversation FSM
├── docker/           # Production Dockerfiles
├── docker-compose.yml
├── coolify/          # Coolify deployment guide
├── n8n/workflows/    # Importable n8n workflow JSON
└── docs/             # Architecture & API docs
```

## Quick Start (local development)

### 1. Prerequisites

- Node.js 20+
- pnpm 9+ (`corepack enable && corepack prepare pnpm@9.12.0 --activate`)
- Docker (for Postgres / Redis / Evolution / n8n)

### 2. Install & configure

```bash
pnpm install
cp .env.example .env
# Fill in JWT_SECRET, EVOLUTION_API_KEY, RAZORPAY_*, etc.
```

### 3. Start infra

```bash
pnpm docker:up
```

This boots Postgres (5432), Redis (6379), Evolution API (8080), n8n (5678).

### 4. Migrate & seed DB

```bash
pnpm db:generate
pnpm db:migrate    # creates tables
pnpm db:seed       # creates admin user + sample plans + sample menu
```

Default admin: `admin@thalimate.local` / `ChangeMe!123`

### 5. Run apps

```bash
pnpm dev                    # runs web + worker in parallel
# OR separately
pnpm --filter @thalimate/web dev
pnpm --filter @thalimate/worker dev
```

Visit:
- Customer site: http://localhost:3000
- Admin: http://localhost:3000/admin
- Kitchen: http://localhost:3000/kitchen
- Delivery: http://localhost:3000/delivery
- Health: http://localhost:3000/api/health

### 6. Connect WhatsApp

1. Open Evolution manager: http://localhost:8080/manager (key from `.env`)
2. Create instance `thalimate`
3. Scan QR with the WhatsApp account
4. Confirm webhook URL is `http://host.docker.internal:3000/api/webhooks/whatsapp`
5. Send "Hi" from any phone to your WhatsApp number → bot responds

## Conversation Flow

```
Customer: Hi
   ↓
Bot: Welcome to ThaliMate. 1️⃣ Lunch  2️⃣ Dinner
   ↓
Customer: 1
   ↓
Bot: Choose Meal Box. 1 Daily Delight 2 Premium 3 Signature
   ↓
… plan → diet → customize items (1,4,7) → "done" → address → confirm → pay
```

State persists in Redis + Postgres so the conversation survives restarts.

## API Reference (selected)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/webhooks/whatsapp` | HMAC | Incoming WhatsApp events |
| POST | `/api/webhooks/razorpay` | HMAC | Payment events |
| POST | `/api/auth/login` | — | Admin login |
| GET/POST | `/api/admin/menu-items` | ADMIN | CRUD menu items |
| GET/POST | `/api/admin/daily-menus` | ADMIN | Schedule daily menus |
| GET/PATCH | `/api/admin/orders` | Staff | List + transition orders |
| GET | `/api/admin/analytics` | ADMIN | Reports (revenue, top items, series) |
| GET | `/api/payments/qr/:code.png` | — | UPI QR PNG |

## Deployment

See [`coolify/README.md`](coolify/README.md) for Coolify+Traefik+VPS deployment with SSL, backups, and health monitoring.

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## License

MIT
