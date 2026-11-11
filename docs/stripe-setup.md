# Stripe setup and recovery

Good Apollo owns its database, order IDs and **dedicated webhook endpoint**. The `STRIPE_TEST_KEY` in the local ignored `.env` authenticated successfully to Stripe test mode. A real test-mode hosted checkout, signed webhook, payment, stock transition, cancellation, and local email delivery have been verified against the isolated `good_apollo_test` database. This does not verify live-mode readiness, automatic-tax registration, or the legal merchant identity.

Use an isolated test key in local/preview and a live key only in the production environment. `STRIPE_LIVE_MODE_APPROVED` must match the key mode; live sales additionally require `VERCEL_ENV=production`, HTTPS, and complete environment/settings. Sales default off. Provider processing for already-created orders remains available when new sales are disabled.

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

Checkout Sessions set `branding_settings.display_name` to “Good Apollo Goods.” Stripe still showed “Senna Automation LLC” in its page title, Link copy and Climate contribution footer during the November 11 Sandbox rehearsal. Justin explicitly requires **Good Apollo Goods** for customer-facing identity. Verify the Stripe account's public business name, statement descriptor, receipts, Link display and Climate attribution; the per-session Checkout label does not change those account-level identities. Preserve accurate legal/KYC information and do not rename another store's shared account as a side effect. Do not enable live sales while any customer-facing identity is unexpected.

Checkout saves the exact request and stable idempotency key before calling Stripe. Default expiry is 35 minutes, above the [30-minute minimum](https://docs.stripe.com/api/checkout/sessions/create). Retrying an uncertain creation reuses the same request/key; it retains stock until provider reconciliation. Requests beyond the recorded provider retry window need manual Dashboard reconciliation. [Stripe idempotency guidance](https://docs.stripe.com/api/idempotent_requests) governs that recovery window.

Start with one $6.95 flat U.S. service including Alaska/Hawaii, with 3–5 business day processing. These defaults are editable. Stripe confirms final tax/total before payment. Automatic tax starts proposed-on but unverified: the recorded Settings confirmation is required. [Stripe Tax setup](https://docs.stripe.com/tax/set-up) and [product tax codes](https://docs.stripe.com/tax/tax-codes) are the authoritative setup references. Hats, clothing, children's clothing and general physical goods have separate configurable classifications.

To cancel unpaid checkout, use its owned status page's cancellation action. It asks Stripe to expire an open session, then retrieves current state and releases only verified unpaid expired stock. An ordinary card decline while Checkout stays open retains the reservation. Returning through cancel does not release it. A completed but processing payment also retains stock.

The authenticated five-minute maintenance route `/api/maintenance/` uses `Authorization: Bearer <CRON_SECRET>`. The planned n8n scheduler supplies it from the dedicated `Good Apollo Maintenance API` HTTP Bearer credential; store the matching production value in Vercel's production environment. The workflow is source-only and inactive until production setup is complete. The local command `npm run maintenance` uses the same persistent recovery implementation. It reconciles missing events, uncertain sessions, refunds and outbox delivery. Settings provides a verified operator invocation as well. Do not force-release an uncertain reservation to fix a count.

Before release, record actual test-mode checkout/cancel, webhook-before-link, duplicate/out-of-order delivery, dropped expiration, provider timeout/restart, refunded-before-paid and dispute outcomes in the evidence packet. The local Vitest suite uses deterministic provider fixtures for those recovery edge cases; the completed real test-mode checkout verifies the primary purchase path but does not substitute for the remaining recovery scenarios.
