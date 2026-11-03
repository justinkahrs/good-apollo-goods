import { readFile, writeFile, chmod, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parse } from 'dotenv';
const path = '.env';
const existing = await readFile(path, 'utf8').catch(() => '');
const current = parse(existing);
if (!current.DATABASE_URL) {
  const password = randomBytes(24).toString('hex');
  // Fixed identifiers and a hex-only generated password; never print connection strings.
  execFileSync(
    '/opt/homebrew/bin/psql',
    ['-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'],
    {
      input: `CREATE ROLE good_apollo_local LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE;\nCREATE DATABASE good_apollo_dev OWNER good_apollo_local;\nCREATE DATABASE good_apollo_test OWNER good_apollo_local;\n`,
      stdio: ['pipe', 'ignore', 'pipe'],
    },
  );
  const url = `postgresql://good_apollo_local:${password}@localhost:5432/good_apollo_dev`;
  const values = {
    APP_URL: 'http://localhost:4371',
    DATABASE_URL: url,
    DIRECT_DATABASE_URL: url,
    TEST_DATABASE_URL: url.replace('good_apollo_dev', 'good_apollo_test'),
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    QUOTE_SECRET: randomBytes(32).toString('hex'),
    CRON_SECRET: randomBytes(32).toString('hex'),
    ADMIN_EMAIL: 'hello@annakahrs.com',
    SALES_ENABLED: 'false',
    STRIPE_LIVE_MODE_APPROVED: 'false',
    S3_BUCKET: 'good-apollo-local',
    S3_ENDPOINT: 'http://localhost:19000',
    S3_FORCE_PATH_STYLE: 'true',
    AWS_REGION: 'us-east-1',
    AWS_ACCESS_KEY_ID: 'local-development',
    AWS_SECRET_ACCESS_KEY: 'local-development-only',
    SMTP_HOST: 'localhost',
    SMTP_PORT: '11025',
    SMTP_SECURE: 'false',
    SMTP_FROM: 'Good Apollo Goods <hello@annakahrs.com>',
    LOCAL_MAIL: 'true',
  };
  await writeFile(
    path,
    existing +
      '\n' +
      Object.entries(values)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join('\n') +
      '\n',
  );
  await chmod(path, 0o600);
  console.log(
    'Created independent local development and test databases; saved local settings.',
  );
}
await mkdir('.local', { recursive: true });
const provider = parse(
  await readFile('/Users/justin/Projects/vesper/.env', 'utf8'),
);
const allowed = [
  'STRIPE_SECRET_KEY',
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'SMTP_FROM',
];
await writeFile(
  '.local/shared-providers.env',
  allowed
    .filter((k) => provider[k])
    .map((k) => `${k}=${JSON.stringify(provider[k])}`)
    .join('\n') + '\n',
  { mode: 0o600 },
);
console.log(
  'Saved authorized provider credentials privately; Vesper database, auth and webhook keys excluded.',
);
