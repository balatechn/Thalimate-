# API Reference

All routes return JSON unless noted. Auth via `tm_session` HttpOnly cookie (set by `/api/auth/login`).

## Auth

### POST `/api/auth/login`
Body: `{ email, password }`
Response: `{ ok: true, role }`

### POST `/api/auth/logout`

## Webhooks

### POST `/api/webhooks/whatsapp`
Headers: `x-hub-signature-256: sha256=<hex>` (HMAC of raw body using `EVOLUTION_WEBHOOK_SECRET`)
Body: Evolution API event (`messages.upsert`)

### POST `/api/webhooks/razorpay`
Headers: `x-razorpay-signature: <hex>` (HMAC using `RAZORPAY_WEBHOOK_SECRET`)
Events handled: `payment.captured`, `payment.failed`, `order.paid`

## Admin (role: ADMIN unless noted)

### GET `/api/admin/menu-items?category=SABZI`
### POST `/api/admin/menu-items`
Body: `{ name, category, diet, price, ... }` (Zod `menuItemSchema`)

### PATCH `/api/admin/menu-items/[id]`
### DELETE `/api/admin/menu-items/[id]` (soft delete via `active=false`)

### GET `/api/admin/daily-menus?date=2026-05-11`
### POST `/api/admin/daily-menus`
Body: `{ date, mealTime: 'LUNCH'|'DINNER', diet: 'REGULAR'|'JAIN', itemIds: [] }`

### GET `/api/admin/orders?status=PAID&take=50` (any staff role)
### PATCH `/api/admin/orders`
Body: `{ id, status }` (auto-enqueues customer notification)

### GET `/api/admin/analytics`
Returns `{ today, customers, series, topItems }`

## Customer-facing

### GET `/api/payments/qr/[code].png`
Returns PNG QR code for the UPI payment of order `code`.

## Health

### GET `/api/health`
