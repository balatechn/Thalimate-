// One-time setup script: creates the 'thalimate' WhatsApp instance in Evolution API
// and registers the webhook pointing to this app.
// Run: node scripts/evo-setup.mjs
// Env vars read from .env in project root.

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

// Parse .env manually (no dotenv dependency needed)
function loadEnv() {
  try {
    const raw = readFileSync(resolve(__dir, '../.env'), 'utf8');
    const env = {};
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return env;
  } catch { return {}; }
}

const env = loadEnv();
const BASE = (env.EVOLUTION_API_URL || 'http://localhost:8080').replace(/\/$/, '');
const API_KEY = env.EVOLUTION_API_KEY || 'replace-me';
const INSTANCE = env.EVOLUTION_INSTANCE || 'thalimate';
const APP_URL = env.APP_URL || 'http://localhost:3000';
const WEBHOOK_URL = `${APP_URL}/api/webhooks/whatsapp`;

const headers = { 'Content-Type': 'application/json', apikey: API_KEY };

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
}

async function main() {
  console.log(`\n🔧 Evolution API Setup`);
  console.log(`   URL     : ${BASE}`);
  console.log(`   Instance: ${INSTANCE}`);
  console.log(`   Webhook : ${WEBHOOK_URL}\n`);

  // 1. Check if instance already exists
  const list = await api('GET', '/instance/fetchInstances');
  const existing = Array.isArray(list.data)
    ? list.data.find(i => i.instance?.instanceName === INSTANCE || i.instanceName === INSTANCE)
    : null;

  if (existing) {
    console.log(`✅ Instance '${INSTANCE}' already exists. Skipping creation.`);
  } else {
    console.log(`📱 Creating instance '${INSTANCE}'...`);
    const created = await api('POST', '/instance/create', {
      instanceName: INSTANCE,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    });
    // 403 "already in use" is fine — instance exists
    if (!created.ok && !(created.status === 403 && JSON.stringify(created.data).includes('already in use'))) {
      console.error('❌ Failed to create instance:', JSON.stringify(created.data, null, 2));
      process.exit(1);
    }
    console.log(`✅ Instance ready.`);
  }

  // 2. Set webhook
  console.log(`\n🔗 Configuring webhook → ${WEBHOOK_URL}`);
  const wh = await api('POST', `/webhook/set/${INSTANCE}`, {
    webhook: {
      enabled: true,
      url: WEBHOOK_URL,
      byEvents: false,
      base64: false,
      events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
    },
  });
  if (wh.ok) {
    console.log(`✅ Webhook configured.`);
  } else {
    console.warn(`⚠️  Webhook set returned ${wh.status}:`, JSON.stringify(wh.data));
  }

  // 3. Fetch QR code
  console.log(`\n📲 Fetching QR code for WhatsApp pairing...`);
  const qr = await api('GET', `/instance/connect/${INSTANCE}`);
  if (qr.ok && qr.data?.base64) {
    console.log(`\n✅ QR Code received (base64 image).`);
    console.log(`\n👉 Open the Evolution API manager to scan:`);
    console.log(`   http://localhost:8080/manager`);
    console.log(`\n   OR scan this QR in WhatsApp → Linked Devices → Link a Device`);
    console.log(`\n   Base64 (first 80 chars): ${qr.data.base64.slice(0, 80)}...`);
  } else if (qr.ok && qr.data?.pairingCode) {
    console.log(`\n✅ Pairing code: ${qr.data.pairingCode}`);
  } else {
    console.log(`ℹ️  QR response:`, JSON.stringify(qr.data, null, 2));
    console.log(`\n👉 Open http://localhost:8080/manager and scan from there.`);
  }

  console.log(`\n📋 Next steps:`);
  console.log(`   1. Open WhatsApp on +919920556676`);
  console.log(`   2. Tap ⋮ → Linked Devices → Link a Device`);
  console.log(`   3. Scan the QR at http://localhost:8080/manager`);
  console.log(`   4. Once connected, send "Thali" to test the bot\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
