import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { magicLink } from 'better-auth/plugins/magic-link';
import { admin } from 'better-auth/plugins/admin';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { createHash } from 'node:crypto';
import { config, requiredSecret, adminEmails } from './config';
import { db } from './db';
import { enqueue, deliverOutbox } from './email';
import { DomainError } from './domain';
let instance: ReturnType<typeof makeAuth> | undefined;

function loopback(hostname: string) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
}

export function isLocalDevelopmentRequest(request: Request) {
  if (process.env.NODE_ENV !== 'development') return false;
  const appUrl = new URL(config().APP_URL);
  return loopback(new URL(request.url).hostname) && loopback(appUrl.hostname);
}

function makeAuth() {
  const e = config();
  return betterAuth({
    appName: 'Good Apollo Goods',
    baseURL: e.APP_URL,
    secret: requiredSecret('BETTER_AUTH_SECRET'),
    trustedOrigins: [e.APP_URL],
    database: prismaAdapter(db(), { provider: 'postgresql' }),
    session: {
      expiresIn: 7 * 86400,
      updateAge: 86400,
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 60 },
    logger: { disabled: true },
    advanced: {
      useSecureCookies: e.APP_URL.startsWith('https://'),
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: e.APP_URL.startsWith('https://'),
        path: '/',
      },
      database: { generateId: 'uuid' },
    },
    plugins: [
      admin({ defaultRole: 'user', adminRoles: ['admin'] }),
      magicLink({
        disableSignUp: true,
        expiresIn: 900,
        storeToken: 'hashed',
        rateLimit: { window: 60, max: 5 },
        sendMagicLink: async ({ email, url }) => {
          if (!adminEmails().includes(email.trim().toLowerCase())) return;
          await enqueue(
            db(),
            `signin:${createHash('sha256').update(url).digest('hex')}`,
            'signin',
            { email, url },
          );
          await deliverOutbox(1, 'signin');
        },
      }),
      twoFactor({
        issuer: 'Good Apollo Goods',
        allowPasswordless: true,
        trustDeviceMaxAge: 8 * 3600,
        accountLockout: {
          enabled: true,
          maxFailedAttempts: 5,
          durationSeconds: 900,
        },
      }),
    ],
  });
}
export function auth() {
  return (instance ??= makeAuth());
}
export async function adminSession(request: Request, verified = true) {
  if (isLocalDevelopmentRequest(request)) {
    const email = adminEmails()[0];
    const user = await db().user.upsert({
      where: { email },
      create: {
        email,
        name: 'Local development operator',
        emailVerified: true,
        role: 'admin',
      },
      update: { emailVerified: true, role: 'admin', banned: false },
    });
    return {
      user,
      session: { id: `local-development:${user.id}` },
    } as unknown as NonNullable<
      Awaited<ReturnType<ReturnType<typeof auth>['api']['getSession']>>
    > & { user: typeof user };
  }

  const session = await auth().api.getSession({ headers: request.headers });
  if (!session)
    throw new DomainError(
      'Sign in to continue. Your form changes are saved on this device.',
      401,
      'signin',
    );
  const user = await db().user.findUnique({ where: { id: session.user.id } });
  if (
    !user ||
    !user.emailVerified ||
    user.role !== 'admin' ||
    user.banned ||
    !adminEmails().includes(user.email.toLowerCase())
  )
    throw new DomainError(
      'Verified operator access is required.',
      403,
      'admin',
    );
  if (verified) {
    const step = await db().adminStepUp.findUnique({
      where: { sessionId: session.session.id },
    });
    if (
      !user.twoFactorEnabled ||
      !step ||
      step.userId !== user.id ||
      step.expiresAt.getTime() <= Date.now()
    )
      throw new DomainError(
        'Verify your authenticator code to continue. Your form changes are saved.',
        403,
        'verify',
      );
  }
  return { ...session, user };
}
export async function verifyStepUp(
  request: Request,
  code: string,
  recovery = false,
) {
  await adminSession(request, false);
  const result = recovery
    ? await auth().api.verifyBackupCode({
        headers: request.headers,
        body: { code, disableSession: false },
        returnHeaders: true,
      })
    : await auth().api.verifyTOTP({
        headers: request.headers,
        body: { code, trustDevice: false },
        returnHeaders: true,
      });
  const cookies = new Map(
    (request.headers.get('cookie') ?? '')
      .split(';')
      .filter(Boolean)
      .map((s) => {
        const i = s.indexOf('=');
        return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
      }),
  );
  for (const raw of result.headers.getSetCookie()) {
    const first = raw.split(';')[0],
      i = first.indexOf('=');
    if (/max-age=0/i.test(raw)) cookies.delete(first.slice(0, i));
    else cookies.set(first.slice(0, i), first.slice(i + 1));
  }
  const headers = new Headers(request.headers);
  headers.set('cookie', [...cookies].map(([k, v]) => `${k}=${v}`).join('; '));
  const refreshed = await adminSession(
    new Request(request.url, { headers }),
    false,
  );
  if (!refreshed.user.twoFactorEnabled)
    throw new DomainError('Finish authenticator enrollment first.', 403);
  await db().adminStepUp.upsert({
    where: { sessionId: refreshed.session.id },
    create: {
      sessionId: refreshed.session.id,
      userId: refreshed.user.id,
      expiresAt: new Date(Date.now() + 8 * 3600000),
    },
    update: { expiresAt: new Date(Date.now() + 8 * 3600000) },
  });
  await db().audit.create({
    data: {
      actorId: refreshed.user.id,
      action: recovery ? 'auth.recovery' : 'auth.verify',
      entityId: refreshed.session.id,
    },
  });
  return result.headers;
}
