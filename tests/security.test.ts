import { beforeEach, afterEach, afterAll, it, expect, vi } from 'vitest';
import { randomUUID, createHmac } from 'node:crypto';
import { db } from '../src/server/db';
import { adminSession, auth, verifyStepUp } from '../src/server/auth';
import { config, requiredSecret, adminEmails } from '../src/server/config';
import { originGuard, body, limit } from '../src/server/http';
import { ownedOrder } from '../src/server/payments';
import { POST as authRoute } from '../src/pages/api/auth/[...all]';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
vi.mock('../src/server/email', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/server/email')>()),
  deliverOutbox: vi.fn(async () => ({ delivered: 0, failed: 0 })),
}));
function request(cookie?: string) {
  return new Request(config().APP_URL + '/api/admin/action/', {
    headers: cookie ? { cookie } : {},
  });
}
async function session(role = 'admin', enabled = true, email?: string) {
  const user = await db().user.create({
    data: {
      name: 'Fixture operator',
      email:
        email ??
        (role === 'admin'
          ? config().ADMIN_EMAIL
          : 'unauthorized@example.invalid'),
      role,
      emailVerified: true,
      twoFactorEnabled: enabled,
    },
  });
  const token = randomUUID(),
    s = await db().session.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
  const signed = encodeURIComponent(
    token +
      '.' +
      createHmac('sha256', requiredSecret('BETTER_AUTH_SECRET'))
        .update(token)
        .digest('base64'),
  );
  return { user, s, request: request('better-auth.session_token=' + signed) };
}
beforeEach(async () => {
  await db().user.deleteMany();
  await db().requestLimit.deleteMany();
  await db().emailOutbox.deleteMany({ where: { kind: 'signin' } });
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => db().$disconnect());
it('rejects anonymous and ordinary users', async () => {
  await expect(adminSession(request())).rejects.toMatchObject({ status: 401 });
  const f = await session('user');
  await expect(adminSession(f.request)).rejects.toMatchObject({ status: 403 });
  await db().user.update({ where: { id: f.user.id }, data: { role: 'admin' } });
  await expect(adminSession(f.request, false)).rejects.toMatchObject({
    code: 'admin',
  });
});
it('disables signup and bootstraps only both allowlisted operators idempotently', async () => {
  vi.stubEnv(
    'ADDITIONAL_ADMIN_EMAILS',
    ' JUSTIN@JUSTINKAHRS.COM,hello@annakahrs.com,justin@justinkahrs.com ',
  );
  const signup = await authRoute({
    request: new Request(config().APP_URL + '/api/auth/sign-up/email/', {
      method: 'POST',
      headers: { origin: config().APP_URL, 'content-type': 'application/json' },
      body: '{}',
    }),
  } as any);
  expect(signup.status).toBe(404);
  await auth().api.signInMagicLink({
    headers: new Headers({ origin: config().APP_URL }),
    body: {
      email: 'unapproved@example.invalid',
      callbackURL: '/admin/verify/',
    },
  });
  expect(await db().user.count()).toBe(0);
  execFileSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/bootstrap-admin.ts'],
    { env: process.env, stdio: 'ignore' },
  );
  execFileSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/bootstrap-admin.ts'],
    { env: process.env, stdio: 'ignore' },
  );
  const operators = await db().user.findMany({ orderBy: { email: 'asc' } });
  expect(operators.map((operator) => operator.email)).toEqual(
    adminEmails().sort(),
  );
  expect(operators).toHaveLength(2);
  for (const operator of operators) {
    expect(operator.role).toBe('admin');
    expect(operator.emailVerified).toBe(false);
    await auth().api.signInMagicLink({
      headers: new Headers({ origin: config().APP_URL }),
      body: { email: operator.email, callbackURL: '/admin/verify/' },
    });
  }
  const notices = await db().emailOutbox.findMany({
    where: { kind: 'signin' },
  });
  expect(
    notices.map((notice) => (notice.payload as { email: string }).email).sort(),
  ).toEqual(adminEmails().sort());
});
it('requires MFA for the extra admin and denies a removed allowlist entry immediately', async () => {
  vi.stubEnv('ADDITIONAL_ADMIN_EMAILS', 'justin@justinkahrs.com');
  const f = await session('admin', true, 'justin@justinkahrs.com');
  expect((await adminSession(f.request, false)).user.id).toBe(f.user.id);
  await expect(adminSession(f.request)).rejects.toMatchObject({
    code: 'verify',
  });
  await db().adminStepUp.create({
    data: {
      sessionId: f.s.id,
      userId: f.user.id,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  expect((await adminSession(f.request)).user.id).toBe(f.user.id);
  vi.stubEnv('ADDITIONAL_ADMIN_EMAILS', '');
  await expect(adminSession(f.request)).rejects.toMatchObject({
    code: 'admin',
  });
});
it('enforces current-session MFA, expiration and immediate revocation', async () => {
  const f = await session();
  await expect(adminSession(f.request)).rejects.toMatchObject({
    code: 'verify',
  });
  await db().adminStepUp.create({
    data: {
      sessionId: f.s.id,
      userId: f.user.id,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  expect((await adminSession(f.request)).user.id).toBe(f.user.id);
  await db().adminStepUp.update({
    where: { sessionId: f.s.id },
    data: { expiresAt: new Date(Date.now() - 1) },
  });
  await expect(adminSession(f.request)).rejects.toMatchObject({
    code: 'verify',
  });
  await db().session.delete({ where: { id: f.s.id } });
  await expect(adminSession(f.request)).rejects.toMatchObject({ status: 401 });
});
it('rejects unverified email and changed admin role even with a valid session', async () => {
  const f = await session();
  await db().adminStepUp.create({
    data: {
      sessionId: f.s.id,
      userId: f.user.id,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  await db().user.update({ where: { id: f.user.id }, data: { role: 'user' } });
  await expect(adminSession(f.request)).rejects.toMatchObject({ status: 403 });
  await db().user.update({
    where: { id: f.user.id },
    data: { role: 'admin', emailVerified: false },
  });
  await expect(adminSession(f.request)).rejects.toMatchObject({ status: 403 });
});
it('requires same-origin mutations and bounds streamed JSON without trusting content-length', async () => {
  expect(() =>
    originGuard(
      new Request(config().APP_URL + '/api/checkout/', {
        headers: { origin: 'https://other.invalid' },
      }),
    ),
  ).toThrow();
  originGuard(
    new Request(config().APP_URL + '/api/checkout/', {
      headers: { origin: new URL(config().APP_URL).origin },
    }),
  );
  await expect(
    body(
      new Request(config().APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '"' + 'x'.repeat(100) + '"',
      }),
      20,
    ),
  ).rejects.toMatchObject({ status: 413 });
});
it('limits requests across instances using persisted counters', async () => {
  const r = request();
  await limit(r, 'fixture', 2, 60, 'same');
  await limit(r, 'fixture', 2, 60, 'same');
  await expect(limit(r, 'fixture', 2, 60, 'same')).rejects.toMatchObject({
    status: 429,
  });
});
it('bare order IDs cannot disclose private records', async () => {
  await expect(ownedOrder('unknown', randomUUID())).rejects.toMatchObject({
    status: 404,
  });
});
function withCookies(request: Request, headers: Headers) {
  const cookies = new Map(
    (request.headers.get('cookie') ?? '')
      .split(';')
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
      }),
  );
  for (const raw of headers.getSetCookie()) {
    const first = raw.split(';')[0],
      index = first.indexOf('=');
    if (/max-age=0/i.test(raw)) cookies.delete(first.slice(0, index));
    else cookies.set(first.slice(0, index), first.slice(index + 1));
  }
  return new Request(request.url, {
    headers: { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') },
  });
}
it('enrolls a real authenticator, accepts recovery once and rejects reuse', async () => {
  const f = await session('admin', false);
  const enrollmentResponse = await authRoute({
    request: new Request(config().APP_URL + '/api/auth/two-factor/enable/', {
      method: 'POST',
      headers: {
        cookie: f.request.headers.get('cookie')!,
        origin: config().APP_URL,
        'content-type': 'application/json',
      },
      body: '{}',
    }),
  } as any);
  expect(enrollmentResponse.status).toBe(200);
  const enrollment = await enrollmentResponse.json();
  if (enrollment.method !== 'totp')
    throw new Error('Authenticator fixture did not use TOTP');
  expect(enrollment.qrDataURL.startsWith('data:image/png;base64,')).toBe(true);
  const image = await sharp(
    Buffer.from(enrollment.qrDataURL.split(',')[1], 'base64'),
  ).metadata();
  expect(image.width).toBe(240);
  expect(image.height).toBe(240);
  const secret = new URL(enrollment.totpURI).searchParams.get('secret')!;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.toUpperCase().replace(/=+$/, ''))
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const bytes = Buffer.from(
    bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', bytes).update(counter).digest();
  const offset = digest.at(-1)! & 15;
  const code = String(
    (digest.readUInt32BE(offset) & 0x7fffffff) % 1000000,
  ).padStart(6, '0');
  const verified = withCookies(f.request, await verifyStepUp(f.request, code));
  expect((await adminSession(verified)).user.twoFactorEnabled).toBe(true);
  const recovered = withCookies(
    verified,
    await verifyStepUp(verified, enrollment.backupCodes[0], true),
  );
  expect((await adminSession(recovered)).user.id).toBe(f.user.id);
  await expect(
    verifyStepUp(recovered, enrollment.backupCodes[0], true),
  ).rejects.toThrow();
});
