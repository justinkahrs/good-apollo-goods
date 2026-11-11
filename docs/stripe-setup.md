# Stripe setup and recovery

Good Apollo owns its database, order IDs and **dedicated webhook endpoint**. The `STRIPE_TEST_KEY` in the local ignored `.env` authenticated successfully to Stripe test mode. A real test-mode hosted checkout, signed webhook, payment, stock transition, cancellation, and local email delivery have been verified against the isolated `good_apollo_test` database. This does not verify live-mode readiness, automatic-tax registration, or the legal merchant identity.

Use an isolated test key in local/preview and a live key only in the production environment. `STRIPE_LIVE_MODE_APPROVED` must match the key mode; live sales additionally require `APP_DEPLOYMENT_ENV=production`, HTTPS, and complete environment/settings. Sales default off. Provider processing for already-created orders remains available when new sales are disabled.

Create the endpoint `/api/stripe/webhook/` on the actual Good Apollo host, with API version matching the pinned Stripe SDK's generated types. Record the concrete configured API version in the release packet. Subscribe to:

```text
checkout.session.completed
checkout.session.expired
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
payment_intent.succeeded
payment_intent.payment_failed
charge.refunded
refund.created
refund.updated
refund.failed
charge.dispute.created
charge.dispute.updated
charge.dispute.closed
```

The endpoint verifies raw-body signatures and mode. Reconciliation filters `store=good-apollo-goods`, binds the order/attempt/session, verifies per-line metadata, quantities and unit prices, and reconciles exclusive tax/shipping totals and U.S. delivery. Unrelated Vesper events do not pay Good Apollo orders. Never mark an order paid from the success redirect or an arbitrary event payload alone.

For local provider testing, use the official Stripe CLI to forward a **test-mode** endpoint to `localhost:4371/api/stripe/webhook/`, and keep its temporary signing secret only in process memory or ignored `.env`. Map `STRIPE_TEST_KEY` to the app's `STRIPE_SECRET_KEY` only for the isolated test process, and set `STRIPE_LIVE_MODE_APPROVED=false`. Keep checkout on the `_test` database and local Mailpit; import no customer data. The verified Gina Hat flow was $85.00 plus $6.95 shipping, with tax disabled only in the test fixture: an expired checkout released its hold, a second checkout paid with Stripe's published `4242` test card, the signed webhook consumed the one unit, and the buyer/operator messages were delivered to Mailpit. Never make a synthetic live charge.

Checkout Sessions set `branding_settings.display_name` to “Good Apollo Goods.” Stripe's account-level name also appears in its page title, Link/Climate copy and bank statements. On November 11 Justin explicitly chose to keep the shared account named **Senna Automation** after reviewing its use by another store. Preserve the public business name Senna Automation LLC and statement descriptor SENNA AUTOMATION, as well as accurate legal/KYC information. The storefront/Checkout session label remains Good Apollo Goods. Any future account-wide rebrand requires a new owner decision.

November 11 production verification: account `acct_1QX4kzKr3DWY0r2Q` accepts charges and payouts; Stripe Tax is active with an active U.S./Michigan registration. Dedicated endpoint `we_1UahTsKr3DWY0r2QVg6mHSmC` uses all subscriptions above and API `2026-08-26.dahlia`, matching Stripe SDK 22.6.2. The real runtime's signed ignored-event probe succeeded while sales were disabled. The shared church endpoint was preserved. No live charge or payable test session was created.

Run `npx tsx scripts/verify-stripe.ts --approved-shared-account=acct_1QX4kzKr3DWY0r2Q --probe-webhook` inside the configured production container. It reads only that runtime's keys, verifies account/tax/mode/endpoint/API/subscriptions, and sends a signed ignored event that creates no payment or database work. Its output is redacted metadata and its exit status fails closed. Omit the explicit approved-account flag to require an exact Good Apollo public name/descriptor; use `--test` only in the isolated test runtime. Credentials live in the dedicated agent vault Secure Notes “Good Apollo Goods — Stripe production” and “Good Apollo Goods — Stripe production webhook,” injected into the Good Apollo-scoped private environment.

Checkout saves the exact request and stable idempotency key before calling Stripe. Default expiry is 35 minutes, above the [30-minute minimum](https://docs.stripe.com/api/checkout/sessions/create). Retrying an uncertain creation reuses the same request/key; it retains stock until provider reconciliation. Requests beyond the recorded provider retry window need manual Dashboard reconciliation. [Stripe idempotency guidance](https://docs.stripe.com/api/idempotent_requests) governs that recovery window.

Start with one $6.95 flat U.S. service including Alaska/Hawaii, with 3–5 business day processing. These defaults are editable. Stripe confirms final tax/total before payment. Automatic tax starts proposed-on but unverified: the recorded Settings confirmation is required. [Stripe Tax setup](https://docs.stripe.com/tax/set-up) and [product tax codes](https://docs.stripe.com/tax/tax-codes) are the authoritative setup references. Hats, clothing, children's clothing and general physical goods have separate configurable classifications.

To cancel unpaid checkout, use its owned status page's cancellation action. It asks Stripe to expire an open session, then retrieves current state and releases only verified unpaid expired stock. An ordinary card decline while Checkout stays open retains the reservation. Returning through cancel does not release it. A completed but processing payment also retains stock.

The authenticated five-minute maintenance route `/api/maintenance/` uses `Authorization: Bearer <CRON_SECRET>`. The deployed n8n workflow `gagMaintenanceV1` supplies it from the dedicated `Good Apollo Maintenance API` HTTP Bearer credential to the private VPS route. It was activated November 11; natural five-minute runs were observed successfully. Keep recovery active while sales are disabled. Do not add a second hosting cron schedule. The local command `npm run maintenance` uses the same persistent recovery implementation. It reconciles missing events, uncertain sessions, refunds and outbox delivery. Settings provides a verified operator invocation as well. Do not force-release an uncertain reservation to fix a count.

Before release, record actual test-mode checkout/cancel, webhook-before-link, duplicate/out-of-order delivery, dropped expiration, provider timeout/restart, refunded-before-paid and dispute outcomes in the evidence packet. The local Vitest suite uses deterministic provider fixtures for those recovery edge cases; the completed real test-mode checkout verifies the primary purchase path but does not substitute for the remaining recovery scenarios.
