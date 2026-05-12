process.env.DATABASE_URL = 'postgresql://thalimate:thalimate@127.0.0.1:5434/thalimate?sslmode=disable';
const { PrismaClient } = require('./node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/@prisma/client/index.js');
const { PrismaPg } = require('./node_modules/.pnpm/@prisma+adapter-pg@5.22.0_pg@8.20.0/node_modules/@prisma/adapter-pg/dist/index.js');
const { Pool } = require('./node_modules/.pnpm/pg@8.20.0/node_modules/pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const p = new PrismaClient({ adapter });
p.$connect()
  .then(() => p.$queryRawUnsafe('SELECT 1 AS ok'))
  .then(r => { console.log('CONNECTED + QUERY OK:', JSON.stringify(r)); return p.$disconnect(); })
  .catch(e => { console.error('FAIL:', e.message.slice(0, 300)); process.exit(1); });
