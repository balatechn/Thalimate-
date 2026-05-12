# Coolify Deployment Guide

ThaliMate is designed to deploy on a single VPS using **Coolify** with **Traefik** as the reverse proxy and automatic Let's Encrypt SSL.

## Prerequisites

- VPS (Ubuntu 22.04+, 4GB+ RAM)
- Coolify installed (https://coolify.io)
- A domain (e.g. `thalimate.example.com`)
- Cloudflare or any DNS pointing to the VPS

## Services to deploy in Coolify

Create these resources in your Coolify project:

| # | Service | Type | Notes |
|---|---|---|---|
| 1 | PostgreSQL 16 | Database | Single DB; create `thalimate`, `evolution`, `n8n` schemas |
| 2 | Redis 7 | Database | Used for BullMQ + cache |
| 3 | thalimate-web | App (Dockerfile) | Public, behind Traefik. `docker/web.Dockerfile` |
| 4 | thalimate-worker | App (Dockerfile) | Internal only. `docker/worker.Dockerfile` |
| 5 | Evolution API | App (image: `atendai/evolution-api:latest`) | Public on `wa.<domain>` |
| 6 | n8n | App (image: `n8nio/n8n:latest`) | Private (basic auth) on `n8n.<domain>` |

## Environment Variables (web + worker)

Copy from `.env.example`. Required in production:

```env
NODE_ENV=production
APP_URL=https://thalimate.example.com
DATABASE_URL=postgresql://thalimate:STRONG@postgres:5432/thalimate
REDIS_URL=redis://redis:6379
JWT_SECRET=<openssl rand -hex 32>
EVOLUTION_API_URL=https://wa.thalimate.example.com
EVOLUTION_API_KEY=<random>
EVOLUTION_INSTANCE=thalimate
EVOLUTION_WEBHOOK_SECRET=<openssl rand -hex 32>
PAYMENT_PROVIDER=razorpay
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
UPI_VPA=yourupi@bank
UPI_PAYEE_NAME=ThaliMate
```

## First-time setup (after deploy)

```bash
# Inside the web container
pnpm --filter @thalimate/db deploy   # runs prisma migrate deploy
pnpm --filter @thalimate/db seed     # creates admin + sample plans/menu
```

## WhatsApp connection

1. Open `https://wa.thalimate.example.com/manager`.
2. Create an instance named `thalimate`.
3. Scan the QR code with the WhatsApp business number.
4. Verify the global webhook is set to `https://thalimate.example.com/api/webhooks/whatsapp`.

## Razorpay webhook

In Razorpay dashboard → Webhooks add:

- URL: `https://thalimate.example.com/api/webhooks/razorpay`
- Events: `payment.captured`, `payment.failed`, `order.paid`
- Secret: same as `RAZORPAY_WEBHOOK_SECRET`

## Backups

Coolify supports automatic Postgres backups. Configure daily snapshots to S3-compatible storage.

## Health monitoring

- App: `GET /api/health`
- Configure Coolify health checks on all services.
- Recommended: Uptime Kuma + Grafana/Loki for logs.

## Scaling

- Web: increase replicas in Coolify; sticky sessions not required (JWT cookies).
- Worker: increase replicas; BullMQ handles concurrent consumers safely.
- Postgres: pgBouncer for connection pooling under heavy load.
- Evolution API: keep at 1 instance per WhatsApp number.
