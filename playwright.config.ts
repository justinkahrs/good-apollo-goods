import 'dotenv/config';
import { defineConfig } from '@playwright/test';
const database = process.env.TEST_DATABASE_URL;
const browserPort = Number(process.env.GAG_BROWSER_TEST_PORT ?? 4372);
if (
  !database ||
  !new URL(database).pathname.endsWith('_test') ||
  !['localhost', '127.0.0.1'].includes(new URL(database).hostname)
)
  throw new Error(
    'Browser tests require an isolated localhost database ending in _test.',
  );
if (!Number.isInteger(browserPort) || browserPort < 1024 || browserPort > 65535)
  throw new Error('Browser test port must be an integer from 1024 to 65535.');
process.env.DATABASE_URL = database;
process.env.DIRECT_DATABASE_URL = database;
process.env.APP_URL = `http://127.0.0.1:${browserPort}`;
process.env.NODE_ENV = 'test';
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  fullyParallel: false,
  reporter: 'dot',
  use: {
    baseURL: process.env.APP_URL,
    channel: 'chrome',
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node --env-file-if-exists=.env dist/server/entry.mjs',
    url: `${process.env.APP_URL}/admin/sign-in/`,
    reuseExistingServer: false,
    timeout: 30000,
    env: {
      DATABASE_URL: database,
      DIRECT_DATABASE_URL: database,
      APP_URL: process.env.APP_URL,
      NODE_ENV: 'test',
      SALES_ENABLED: 'false',
      STRIPE_LIVE_MODE_APPROVED: 'false',
      ASTRO_NODE_AUTOSTART: 'enabled',
      HOST: '127.0.0.1',
      PORT: String(browserPort),
    },
  },
});
