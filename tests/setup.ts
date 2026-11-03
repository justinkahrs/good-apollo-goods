import 'dotenv/config';
import { execFileSync } from 'node:child_process';
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !new URL(url).pathname.endsWith('_test') ||
  !['localhost', '127.0.0.1'].includes(new URL(url).hostname)
)
  throw new Error('Tests require an isolated local database ending in _test.');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = url;
process.env.DIRECT_DATABASE_URL = url;
process.env.STRIPE_SECRET_KEY = 'sk_test_isolated_fixture';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_isolated_fixture';
process.env.STRIPE_LIVE_MODE_APPROVED = 'false';
process.env.SALES_ENABLED = 'true';
execFileSync(
  process.execPath,
  ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  { env: process.env, stdio: 'ignore' },
);
