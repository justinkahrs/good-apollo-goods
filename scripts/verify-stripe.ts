import { readFile } from 'node:fs/promises';
import { parse } from 'dotenv';
import Stripe from 'stripe';
const env = parse(await readFile('.local/shared-providers.env', 'utf8'));
const key = env.STRIPE_SECRET_KEY;
if (!key) throw new Error('Shared Stripe key is absent');
try {
  const stripe = new Stripe(key);
  const settings = await stripe.tax.settings.retrieve();
  console.log(
    JSON.stringify({
      mode: key.includes('_live_') ? 'live' : 'test',
      taxStatus: settings.status,
      taxMissingFields: settings.status_details?.pending?.missing_fields ?? [],
      verifiedAt: new Date().toISOString(),
    }),
  );
} catch (error) {
  console.log(
    JSON.stringify({
      verified: false,
      reason:
        error instanceof Stripe.errors.StripeError
          ? error.type
          : 'provider_unavailable',
    }),
  );
  process.exitCode = 1;
}
