import 'dotenv/config';
import { z } from 'zod';

const flag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');
const schema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    APP_URL: z.url().default('http://localhost:4371'),
    APP_DEPLOYMENT_ENV: z
      .enum(['development', 'preview', 'production'])
      .optional(),
    GAG_NETLIFY_SITE_ID: z.string().min(1).optional(),
    GAG_NETLIFY_PROXY_SECRET: z.string().min(32).optional(),
    GAG_NETLIFY_PROXY_HOST: z
      .string()
      .regex(/^[a-z0-9.-]+$/i)
      .optional(),
    DATABASE_URL: z.string().min(1).optional(),
    BETTER_AUTH_SECRET: z.string().min(32).optional(),
    QUOTE_SECRET: z.string().min(32).optional(),
    CRON_SECRET: z.string().min(32).optional(),
    SALES_ENABLED: flag,
    STRIPE_LIVE_MODE_APPROVED: flag,
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    ADMIN_EMAIL: z.email().default('hello@annakahrs.com'),
    ADDITIONAL_ADMIN_EMAILS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean),
      )
      .pipe(z.array(z.email()).max(20)),
    SUPPORT_EMAIL: z.email().default('hello@goodapollogoods.com'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_SECURE: flag,
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.string().default('Good Apollo Goods <hello@annakahrs.com>'),
    COMMERCE_EMAIL_API_URL: z.url().optional(),
    COMMERCE_EMAIL_HMAC_SECRET: z.string().min(32).optional(),
    AWS_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().optional(),
    S3_ENDPOINT: z.url().optional(),
    S3_FORCE_PATH_STYLE: flag,
    MEDIA_BUDGET_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .default(4294967296),
    LOCAL_MAIL: flag,
    NEWSLETTER_ENABLED: flag,
    NEWSLETTER_CONFIRMATION_DISPATCH_ENABLED: flag,
    NEWSLETTER_CONFIRMATION_ORIGIN: z.url().optional(),
    NEWSLETTER_API_URL: z.url().optional(),
    NEWSLETTER_HMAC_SECRET: z.string().min(32).optional(),
  })
  .superRefine((value, context) => {
    if (!!value.COMMERCE_EMAIL_API_URL !== !!value.COMMERCE_EMAIL_HMAC_SECRET) {
      context.addIssue({ code: 'custom', path: ['COMMERCE_EMAIL_HMAC_SECRET'], message: 'Commerce email route configuration is incomplete' });
    }
    if (value.COMMERCE_EMAIL_API_URL && value.NODE_ENV === 'production' && !value.COMMERCE_EMAIL_API_URL.startsWith('http://senna-mautic-gateway:8091/')) {
      context.addIssue({ code: 'custom', path: ['COMMERCE_EMAIL_API_URL'], message: 'Production commerce email must use the private service network' });
    }
    if (
      value.NEWSLETTER_ENABLED &&
      (!value.NEWSLETTER_API_URL || !value.NEWSLETTER_HMAC_SECRET)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['NEWSLETTER_API_URL'],
        message: 'Newsletter service configuration is incomplete',
      });
      context.addIssue({
        code: 'custom',
        path: ['NEWSLETTER_HMAC_SECRET'],
        message: 'Newsletter service configuration is incomplete',
      });
    }
    if (
      value.NODE_ENV === 'production' &&
      value.NEWSLETTER_API_URL &&
      !value.NEWSLETTER_API_URL.startsWith('https://')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['NEWSLETTER_API_URL'],
        message: 'Newsletter API must use HTTPS in production',
      });
    }
    if (value.NEWSLETTER_API_URL) {
      const endpoint = new URL(value.NEWSLETTER_API_URL);
      if (
        endpoint.username ||
        endpoint.password ||
        endpoint.search ||
        endpoint.hash ||
        (endpoint.pathname !== '/' && endpoint.pathname !== '')
      ) {
        context.addIssue({
          code: 'custom',
          path: ['NEWSLETTER_API_URL'],
          message:
            'Newsletter API must be an origin without credentials, path, query or fragment',
        });
      }
    }
    if (value.NEWSLETTER_CONFIRMATION_ORIGIN) {
      const origin = new URL(value.NEWSLETTER_CONFIRMATION_ORIGIN);
      if (
        origin.username ||
        origin.password ||
        origin.search ||
        origin.hash ||
        (origin.pathname !== '/' && origin.pathname !== '') ||
        (value.NODE_ENV === 'production' && origin.protocol !== 'https:')
      ) {
        context.addIssue({
          code: 'custom',
          path: ['NEWSLETTER_CONFIRMATION_ORIGIN'],
          message:
            'Confirmation origin must be a bare HTTPS origin in production',
        });
      }
    }
  });
export function config() {
  const result = schema.safeParse(process.env);
  if (!result.success)
    throw new Error(
      `Invalid configuration: ${result.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  return result.data;
}
export function adminEmails() {
  const e = config();
  return [
    ...new Set([e.ADMIN_EMAIL.toLowerCase(), ...e.ADDITIONAL_ADMIN_EMAILS]),
  ];
}
export function salesReady() {
  const e = config();
  if (!e.SALES_ENABLED) return false;
  if (
    !e.DATABASE_URL ||
    !e.QUOTE_SECRET ||
    !e.BETTER_AUTH_SECRET ||
    !e.STRIPE_SECRET_KEY ||
    !e.STRIPE_WEBHOOK_SECRET ||
    !e.CRON_SECRET ||
    !e.S3_BUCKET ||
    (!e.SMTP_HOST && (!e.COMMERCE_EMAIL_API_URL || !e.COMMERCE_EMAIL_HMAC_SECRET))
  )
    return false;
  const live =
    e.STRIPE_SECRET_KEY.startsWith('sk_live_') ||
    e.STRIPE_SECRET_KEY.startsWith('rk_live_');
  if (!/^(sk|rk)_(test|live)_/.test(e.STRIPE_SECRET_KEY)) return false;
  if (live !== e.STRIPE_LIVE_MODE_APPROVED) return false;
  if (
    e.NODE_ENV === 'production' &&
    (!e.APP_URL.startsWith('https://') ||
      e.LOCAL_MAIL ||
      !['require', 'verify-full', 'verify-ca'].includes(
        new URL(e.DATABASE_URL).searchParams.get('sslmode') ?? '',
      ) ||
      (live && !productionDeployment()))
  )
    return false;
  return true;
}
export function discoveryEnabled() {
  const e = config();
  return (
    salesReady() &&
    e.NODE_ENV === 'production' &&
    e.STRIPE_LIVE_MODE_APPROVED &&
    productionDeployment()
  );
}
export function productionDeployment() {
  return (
    process.env.APP_DEPLOYMENT_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.CONTEXT === 'production'
  );
}
export function requiredSecret(
  name: 'QUOTE_SECRET' | 'BETTER_AUTH_SECRET' | 'CRON_SECRET',
) {
  const value = config()[name];
  if (!value) throw new Error(`Missing configuration: ${name}`);
  return value;
}
