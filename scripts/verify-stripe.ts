import 'dotenv/config';
import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';

// Verify only this runtime's provider configuration; never import another store's keys.
const key = process.env.STRIPE_SECRET_KEY ?? '';
const expectedMode = process.argv.includes('--test') ? 'test' : 'live';
const mode = /^(sk|rk)_live_/.test(key)
  ? 'live'
  : /^(sk|rk)_test_/.test(key)
    ? 'test'
    : 'absent';
const verifiedAt = new Date().toISOString();
const events = [
  'checkout.session.completed',
  'checkout.session.expired',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'charge.refunded',
  'refund.created',
  'refund.updated',
  'refund.failed',
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
];
try {
  if (mode !== expectedMode)
    throw new Error('stripe_key_mode_mismatch_or_missing');
  const stripe = new Stripe(key, { timeout: 15000, maxNetworkRetries: 1 });
  const origin = new URL(process.env.APP_URL ?? 'https://goodapollogoods.com');
  const [account, tax, registrations, endpoints] = await Promise.all([
    stripe.accounts.retrieveCurrent(),
    stripe.tax.settings.retrieve(),
    stripe.tax.registrations.list({ status: 'active', limit: 100 }),
    stripe.webhookEndpoints.list({ limit: 100 }),
  ]);
  const dedicated = endpoints.data.filter((endpoint) => {
    const url = new URL(endpoint.url);
    return (
      url.origin === origin.origin &&
      url.pathname.replace(/\/$/, '') === '/api/stripe/webhook' &&
      !url.search &&
      !url.username &&
      !url.password &&
      endpoint.livemode === (mode === 'live') &&
      endpoint.status === 'enabled'
    );
  });
  const descriptor = account.settings?.payments?.statement_descriptor ?? '';
  const approvedSharedAccount = process.argv
    .find((arg) => arg.startsWith('--approved-shared-account='))
    ?.split('=')[1];
  const customerFacingName =
    account.business_profile?.name === 'Good Apollo Goods';
  const customerFacingStatement =
    /^GOOD APOLLO/i.test(descriptor) && !/SENNA/i.test(descriptor);
  const sharedIdentityApproved =
    approvedSharedAccount === account.id &&
    account.business_profile?.name === 'Senna Automation LLC' &&
    descriptor === 'SENNA AUTOMATION';
  const checks = {
    accountAcceptsCharges: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    customerIdentityApproved:
      (customerFacingName && customerFacingStatement) || sharedIdentityApproved,
    automaticTaxActive: tax.status === 'active',
    activeTaxRegistration: registrations.data.length > 0,
    dedicatedEndpoint: dedicated.length === 1,
    endpointApiVersion:
      dedicated.length === 1 && dedicated[0].api_version === Stripe.API_VERSION,
    requiredEvents:
      dedicated.length === 1 &&
      events.every(
        (event) =>
          dedicated[0].enabled_events.includes('*') ||
          dedicated[0].enabled_events.includes(event),
      ),
    signingSecretPresent: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    approvedMode:
      (process.env.STRIPE_LIVE_MODE_APPROVED === 'true') === (mode === 'live'),
  };
  let webhookProbe: number | undefined;
  if (
    process.argv.includes('--probe-webhook') &&
    checks.signingSecretPresent &&
    dedicated.length === 1
  ) {
    // This unsubscribed signature/mode probe creates no payment or database work.
    const payload = JSON.stringify({
      id: 'evt_gag_preflight_' + randomUUID(),
      object: 'event',
      type: 'integration.preflight',
      livemode: mode === 'live',
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'gag_preflight' } },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
    });
    const response = await fetch(dedicated[0].url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signature,
      },
      body: payload,
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.json().catch(() => ({}));
    webhookProbe =
      response.status === 200 && body.ignored === true
        ? 200
        : response.status === 200
          ? 500
          : response.status;
  }
  const ready =
    Object.values(checks).every(Boolean) &&
    (!process.argv.includes('--probe-webhook') || webhookProbe === 200);
  console.log(
    JSON.stringify({
      ready,
      verifiedAt,
      mode,
      accountId: account.id,
      businessName: account.business_profile?.name,
      statementDescriptor: descriptor,
      sdkApiVersion: Stripe.API_VERSION,
      checks,
      webhookProbe,
      identity: {
        customerFacingName,
        customerFacingStatement,
        sharedIdentityApproved,
      },
      endpoints: dedicated.map((w) => ({
        id: w.id,
        url: w.url,
        apiVersion: w.api_version,
      })),
      activeRegistrations: registrations.data.map((r) => ({
        country: r.country,
        state: r.country_options?.us?.state,
        status: r.status,
      })),
      salesEnabled: process.env.SALES_ENABLED === 'true',
    }),
  );
  if (!ready) process.exitCode = 1;
} catch (error) {
  console.log(
    JSON.stringify({
      ready: false,
      verifiedAt,
      mode,
      reason:
        error instanceof Stripe.errors.StripeError
          ? error.type
          : error instanceof Error &&
              error.message === 'stripe_key_mode_mismatch_or_missing'
            ? error.message
            : 'provider_verification_failed',
    }),
  );
  process.exitCode = 1;
}
