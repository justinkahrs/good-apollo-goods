import { describe, it, expect, vi } from 'vitest';
import { cents, normalizeCart, total, csvCell } from '../src/server/domain';
import { salesReady, adminEmails } from '../src/server/config';
describe('exact boundaries', () => {
  it('normalizes the explicit admin allowlist and rejects malformed extra emails', () => {
    try {
      vi.stubEnv(
        'ADDITIONAL_ADMIN_EMAILS',
        ' JUSTIN@JUSTINKAHRS.COM,hello@annakahrs.com,justin@justinkahrs.com ',
      );
      expect(adminEmails()).toEqual([
        'hello@annakahrs.com',
        'justin@justinkahrs.com',
      ]);
      vi.stubEnv('ADDITIONAL_ADMIN_EMAILS', '');
      expect(adminEmails()).toEqual(['hello@annakahrs.com']);
      vi.stubEnv('ADDITIONAL_ADMIN_EMAILS', 'not-an-email');
      expect(() => adminEmails()).toThrow('ADDITIONAL_ADMIN_EMAILS');
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('parses dollars without floating point rounding', () => {
    expect(cents('58.01')).toBe(5801);
    expect(cents('0.10')).toBe(10);
    expect(cents('12.3')).toBe(1230);
    expect(cents('0', true)).toBe(0);
  });
  it.each(['1.005', '-1', 'NaN', '1e2', '0', '001', '1,00', '100000'])(
    'rejects invalid price %s',
    (v) => expect(() => cents(v)).toThrow(),
  );
  it('normalizes duplicated lines and rejects excessive or fractional quantities', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(
      normalizeCart([
        { variantId: id, quantity: 2 },
        { variantId: id, quantity: 3 },
      ]),
    ).toEqual([{ variantId: id, quantity: 5 }]);
    expect(() =>
      normalizeCart([
        { variantId: id, quantity: 6 },
        { variantId: id, quantity: 6 },
      ]),
    ).toThrow();
    expect(() => normalizeCart([{ variantId: id, quantity: 1.5 }])).toThrow();
  });
  it('reconciles multi-line totals exactly', () => {
    expect(total(5801 * 2 + 5600, 695, 946)).toBe(18843);
    expect(() => total(100, 0, -1)).toThrow();
  });
  it('escapes spreadsheet formulas and quotes', () => {
    expect(csvCell(' =IMPORTXML("x")')).toBe('"\' =IMPORTXML(""x"")"');
    expect(csvCell('normal')).toBe('"normal"');
  });
  it('fails closed for missing and wrong-mode configuration', () => {
    const key = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    expect(salesReady()).toBe(false);
    process.env.STRIPE_SECRET_KEY = 'sk_live_fixture';
    expect(salesReady()).toBe(false);
    process.env.STRIPE_SECRET_KEY = key;
  });
  it('accepts the guarded commerce mail route as the production outbox transport', () => {
    vi.stubEnv('SMTP_HOST', '');
    vi.stubEnv('COMMERCE_EMAIL_API_URL', 'http://senna-mautic-gateway:8091/');
    vi.stubEnv('COMMERCE_EMAIL_HMAC_SECRET', 'fixture-commerce-email-hmac-secret-at-least-32-bytes');
    expect(salesReady()).toBe(true);
    vi.stubEnv('COMMERCE_EMAIL_HMAC_SECRET', undefined);
    expect(() => salesReady()).toThrow(/COMMERCE_EMAIL_HMAC_SECRET/);
    vi.unstubAllEnvs();
  });
  it('requires production TLS, private storage and an approved live production environment', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_URL', 'https://goodapollogoods.com');
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://fixture@db.invalid/good_apollo?sslmode=require',
    );
    vi.stubEnv('LOCAL_MAIL', 'false');
    vi.stubEnv('S3_ENDPOINT', undefined);
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_fixture');
    vi.stubEnv('STRIPE_LIVE_MODE_APPROVED', 'true');
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(salesReady()).toBe(true);
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(salesReady()).toBe(false);
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgresql://fixture@db.invalid/good_apollo');
    expect(salesReady()).toBe(false);
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://fixture@db.invalid/good_apollo?sslmode=require',
    );
    vi.stubEnv('S3_ENDPOINT', 'http://good-apollo-garage:3900');
    expect(salesReady()).toBe(true);
    vi.unstubAllEnvs();
  });
});
