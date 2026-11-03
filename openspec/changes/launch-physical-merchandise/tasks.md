# Tasks

Checked boxes represent verified local application work. Unchecked boxes retain incomplete service, owner-acceptance or launch requirements even when their code/documentation is partly implemented. Evidence and remaining gates are in `docs/launch-checklist.md`. Planning completion does not mean the store is ready for real sales. Groups follow dependency order; a group is complete only when its own behavior, relevant tests, and operating documentation are verified.

## 1. Runtime, persistence, and isolated development

Covers `production-readiness`: isolated configuration and safe migration; establishes shared foundations for the remaining capabilities.

- [ ] 1.1 Record the existing shared PostgreSQL server with isolated Good Apollo database/runtime/migration roles, per-environment Garage bucket/key, guarded Good Apollo Mautic sender path, VPS resource/disk budget, shared Stripe routing, and existing n8n scheduler in `docs/commerce-architecture.md`; verify isolation, transaction, maintenance, and restore requirements before launch.
- [x] 1.2 Add compatible pinned server-adapter, database, Stripe, auth, validation, image, email, and test dependencies without migrating frameworks; verify installation and `npm run check` under the supported Node 22 runtime and document version constraints.
- [ ] 1.3 Select Astro's standalone Node adapter for VPS production and preserve static informational pages while serving commerce routes on demand; verify a production Node build serves a test endpoint and preserves existing URLs/assets in a protected preview.
- [x] 1.4 Add validated environment configuration, placeholder-only `.env.example`, isolated local/test setup, and a disabled-by-default sales flag; verify missing/mode-mismatched settings fail closed and examples contain no credentials.
- [x] 1.5 Add migrations for catalog/variants/images, stock ledger/balances, checkout attempts/reservations, immutable orders/items, events/refunds/disputes/shipments, outbox/audit, auth/step-up, and store settings; verify clean deployment to a disposable database and required unique/check constraints.
- [x] 1.6 Add exact dollar-to-cents parsing and typed financial/state boundaries; verify meaningful tests for decimals, positive prices, invalid quantities, and reconciled multi-item totals.
- [x] 1.7 Add draft-only idempotent import of `src/data/products.ts` with stable slugs, zero stock, and non-publishable placeholder markers; verify repeated import preserves operator edits/balances and a fresh import lists no saleable products.
- [x] 1.8 Add repeatable domain/integration/browser validation scripts and CI with disposable data; verify an intentional fixture failure is detected and document setup, migrations, and validation commands in README/AGENTS and `docs/commerce-architecture.md`.

## 2. Secure and usable operator shell

Covers `store-administration`: secured access, request boundaries, recoverable saves, audit foundations, and daily navigation.

- [x] 2.1 Adapt Vesper's Better Auth email sign-in to Astro using separate origins/secrets/session tables and allowlisted operator bootstrap; verify unauthorized mailboxes/public signup cannot obtain admin access, bootstrap idempotently establishes only the explicitly configured primary/additional operators, both can sign in, and removing an additional operator revokes existing protected access.
- [x] 2.2 Implement guided TOTP enrollment, recovery, session revocation, and an eight-hour current-session step-up; verify direct protected API/page requests fail for non-admin, absent, expired, or revoked verification and normal actions work during a valid session.
- [x] 2.3 Add shared mutation validation, origin/CSRF controls, distributed limits, safe redirects, and redacted error/log handling; verify cross-site requests and repeated abuse are rejected without printing tokens or personal addresses.
- [x] 2.4 Build Products, Inventory, and Orders navigation plus settings/help with labeled forms, mobile layouts, keyboard focus, feedback, and unsaved-state recovery; verify browser flows on a phone viewport and keyboard without exposing internal IDs in routine fields.
- [x] 2.5 Add revision-conflict handling and shared audit records for mutations; verify two-tab stale edits preserve the newer write and audit metadata identifies actor/action without credentials or customer-address logs.
- [x] 2.6 Document operator enrollment/recovery and developer auth boundaries in `docs/store-operator-guide.md` and `docs/commerce-architecture.md`; verify the documented sign-in/recovery sequence against local test mail and recovery fixtures.

- [x] 2.7 Refine Products, Inventory, Orders/detail and Settings using the product editor's brand, open rows, cover photography, clear counts/statuses and folded secondary actions; verify desktop/mobile filters, settings saves, order snapshot preservation and existing stock/fulfillment workflows.

## 3. Merchandise editing, variants, photos, and live catalog

Covers all `merchandise-catalog` requirements and the product portion of `store-administration`.

- [x] 3.1 Implement product create/edit/duplicate-draft/unpublish/archive forms with descriptions and optional materials/care/audience; verify lifecycle tests, independent duplicate identity/zero stock, and stable published URLs.
- [x] 3.2 Add up-to-two-option variant generation/editing, auto-SKUs, optional SKU override, dollar pricing, active state, and default variants for optionless products; verify unique combinations, exact prices, invalid input recovery, and two sizes of one product in fixtures.
- [x] 3.3 Add product-owned direct-upload intents and finalization with file/byte/pixel limits, content decoding, orientation correction, EXIF/GPS removal, and responsive derivatives; verify forged ownership/type, oversized/malicious content, invalid files, and private original access are rejected.
- [x] 3.4 Build multi-photo upload/progress/retry, thumbnails, accessible reorder, alt text, cover selection, variant association, and archive/replace actions; verify mobile supported-format upload and unsupported HEIC guidance preserve existing photos/form input.
- [x] 3.5 Implement publication validation and atomic published edits, including real-image readiness, positive priced variants, and sold-out publication; verify invalid published saves leave the previous valid listing and imported placeholders cannot publish.
- [x] 3.6 Replace every catalog consumer in home/collection/shop/detail/card pages with request-time catalog data where needed and remove product `getStaticPaths()`; verify committed content/stock is visible on a fresh request within five seconds and database failure never falls back to saleable seed stock.
- [x] 3.7 Preserve existing brand tokens, responsive imagery, URLs, metadata, and accessible selectors; verify desktop/mobile published, sold-out, unpublished, and archived page behavior without a visual redesign.
- [ ] 3.8 Add photo and product workflows to `docs/store-operator-guide.md` and updated component guidance in `docs/design-system.md`; verify the primary operator can follow the new-listing and edit procedures using local fixtures before payment work begins.

- [x] 3.9 Refine the branded product editor for one fixed piece with one price, optional dimensions/details and folded variant/secondary settings; verify desktop/mobile layout, keyboard disclosure, recoverable single-price edits, unchanged stock identity, photos/publication, no artificial storefront choice, and the retained multi-option workflow. Update operator/design guidance and record local evidence.

## 4. Variant stock and checkout holds

Covers all `inventory-control` requirements independently of the external payment API.

- [x] 4.1 Implement available/held/unsold balance projections and append-only idempotent movement operations with database constraints; verify ledger sums equal counters and quantities cannot become fractional/negative or held above unsold.
- [x] 4.2 Add add-stock/remove-stock/set-unsold-count actions with reason, preview, conflict handling, and off-site sale/consignment reasons; verify retries apply once and adjustments cannot overwrite holds or remove committed stock underneath them.
- [x] 4.3 Add inventory search/low-stock/sold-out views with clear unsold-versus-paid-to-pack wording; verify threshold filters use available stock and variants are operable on a phone without a wide-table dependency.
- [x] 4.4 Implement whole-cart reservations using ordered row locks/transactions and bounded conflict retries; verify a real-database last-unit race allows only one reservation and an invalid multi-line cart leaves no partial holds.
- [x] 4.5 Implement once-only consume/release transitions, uncertain/processing hold states, and late-payment attention/reacquire behavior; verify duplicate and out-of-order domain operations never repeat movements, regress paid stock, or create negative quantities.
- [x] 4.6 Add ledger-drift and overdue-hold inspection with safe operator reconciliation actions; verify a deliberately inconsistent test fixture is detected and no direct force-release bypasses verified payment state.
- [ ] 4.7 Document counting, new batches, damage, off-site sales, consignment removal, and stock-history interpretation in `docs/store-operator-guide.md`; verify the operator records a stock change independently within five minutes.

## 5. Cart quotes, shipping settings, and hosted Checkout

Covers `stripe-checkout`: authoritative quotes, preview-cart migration, retry-safe guest sessions; and `order-fulfillment`: shipping/tax configuration.

- [x] 5.1 Replace browser preview storage with a bounded versioned variant/quantity cart and safe DOM rendering; verify legacy/corrupt storage explanations, remove/change-quantity behavior, and stored-HTML injection denial.
- [x] 5.2 Add canonical quote validation for active published variants, duplicate-line normalization, quantity/cart limits, exact prices, and stale-price acknowledgment; verify tampered price/currency/tax/shipping values never control a payable order.
- [x] 5.3 Add settings for one uniform flat U.S. service, processing/delivery wording, tax-exclusive pricing/classification, recorded tax configuration, and low-stock thresholds; verify missing settings disable checkout and country rejection includes non-U.S. addresses while the uniform service covers Alaska/Hawaii.
- [x] 5.4 Implement guest-session-owned attempt tokens, cart fingerprints, immutable order/item/shipping-configuration snapshots, and exact persistent provider request/idempotency keys; verify repeated tokens reuse one attempt and changed carts cannot change an existing request.
- [x] 5.5 Create hosted Stripe Checkout sessions from server-side per-line price data with default 35-minute expiry (headroom above Stripe's 30-minute minimum), shipping collection, approved tax settings, and store/order metadata; verify a test cart with multiple variants uses exact quantities and disables delayed methods, adjustable quantities, promotions, and recovery links.
- [x] 5.6 Handle definite provider failures, uncertain timeouts, session-link races, and explicit cancel-by-provider-expiration; verify a lost create response/crash recovers one session, retains uncertain stock, and never calls Stripe while holding database row locks.
- [x] 5.7 Add owned success/cancel/processing/status routes and purchased-attempt-specific cart clearing; verify bare order/session IDs disclose no private data, private responses are not cached, and later cart additions survive paid confirmation.
- [x] 5.8 Document checkout ownership, snapshots, provider mode/routing, shipping/tax setup, and default 35-minute hold behavior in `docs/commerce-architecture.md` and `docs/stripe-setup.md`; verify the documented local test-mode checkout/cancel sequence.

## 6. Verified payment processing, outbox, and recovery

Covers `stripe-checkout`: verified monotonic processing and unpaid outcomes; `inventory-control`: consume/release/recovery; `production-readiness`: durable maintenance; and `order-fulfillment`: notifications.

- [x] 6.1 Add raw-body Stripe signature verification and mode/store/session/order/payment binding with line, quantity, price, address/service, currency, and total reconciliation; verify invalid signatures, unrelated store events, mismatches, and a webhook-before-session-link race cannot cause incorrect paid state.
- [x] 6.2 Implement paid/pending/failed/expired event transitions with current provider-state lookup and atomic order/stock/event/outbox commits; verify duplicate/concurrent/separate-event-ID payment delivery applies one sale, and old expiry/failure cannot undo it.
- [x] 6.3 Add persistent retryable provider work and handling for unexpected asynchronous success/failure; verify card declines in open sessions retain holds, processing holds persist past nominal expiry, and definitive terminal outcomes consume/release only once.
- [x] 6.4 Adapt transactional email behind a durable outbox for buyer confirmation and operator new-order notice, with delivery leases/dedupe/retry status; verify restart/mail failure preserves paid stock/order state and later retries send the intended content once per queued transition.
- [x] 6.5 Add an authenticated bounded maintenance runner for uncertain attempts, expiry/provider-event reconciliation, email retries, and drift inspection; verify concurrent runners do not repeat work and missing expiration delivery recovers stock after provider confirmation.
- [x] 6.6 Add status-only liveness/readiness and maintenance/hold/delivery/drift alerts; verify two missed five-minute intervals produce a failure alert, attempts older than one hour appear for attention, and public health exposes no connection/customer details.
- [x] 6.7 Document webhook event subscriptions/API version, test-mode forwarding, five-minute scheduler invocation/authentication, retries, and manual reconciliation in `docs/stripe-setup.md` and `docs/store-operations.md`; verify each documented recovery path with a dropped-webhook/process-crash fixture.

## 7. Packing, shipping, refunds, disputes, and business exports

Covers the remaining `order-fulfillment` requirements and `store-administration`: audits/exports.

- [x] 7.1 Build default Paid / To pack views and private order detail with immutable item/financial/address snapshots and independent badges; verify product/settings edits do not change past records and processing/attention/canceled orders cannot be packed.
- [x] 7.2 Add a printable packing slip and full-order mark-shipped action with carrier/tracking/safe URL/time, idempotency, and shipment outbox insertion; verify retry-safe shipment, correct rendered items/address, and no second stock decrement.
- [x] 7.3 Add shipment email delivery and tracking content through the existing outbox; verify buyer messages show the recorded carrier/tracking and a mail failure leaves one shipment with a retryable notification.
- [x] 7.4 Implement unshipped cancellation and full/monetary-partial refund requests with remaining-amount limits, provider idempotency, and request/pending/success/failure states; verify concurrent cancellation/shipment decisions serialize and a failed refund never reports success.
- [x] 7.5 Reconcile app- and provider-dashboard refunds including duplicate/out-of-order/full-refund-before-paid events; verify refunded orders cannot accidentally return to To pack and refunds leave inventory unchanged.
- [x] 7.6 Add dispute event reconciliation, attention/deadline/provider-dashboard display, notification, and unshipped blocking; verify shipped history remains accessible, duplicates are safe, and no dispute automatically refunds/restocks merchandise.
- [x] 7.7 Add deliberate item-quantity restocking with presence/condition/reason confirmation and sold-minus-prior-restock bounds; verify returned/unshipped-canceled scenarios, no restock for a lost parcel refund, and retries cannot add extra units.
- [x] 7.8 Add protected catalog/stock/order exports and audit/history views with spreadsheet formula escaping; verify unauthenticated export denial, usable variant/financial columns, and formula-like fixture safety.
- [ ] 7.9 Document packing, external label purchase, shipment, cancellation, exceptional refunds, Stripe Dashboard disputes, and physical restocking in `docs/store-operator-guide.md`; verify the operator packs a test order in five minutes and can distinguish refunding money from adding stock.

## 8. Production operations, content, and release preparation

Covers `production-readiness`: isolated deployment, recovery, migration/rollback, and accurate public content.

- [ ] 8.1 Configure a protected test-mode preview on the VPS with isolated Good Apollo database/storage/auth credentials and test payments; apply web-container CPU/memory limits, the 4 GiB app-level media budget, and a verified VPS disk warning at 90% used (10% free) with notification delivery. Reconcile existing object bytes before enabling uploads to a nonempty bucket. Verify five-minute n8n maintenance, database connectivity, customer routes, upload path, bounded load, and no production/Vesper mutation or resource impact to other services.
- [ ] 8.2 Update `docs/deployment.md`, README, and AGENTS for standalone Node output, VPS Compose/Traefik release, migrations, environment scoping, Garage, Mautic, scheduler, resource limits, release, and rollback; verify the documented preview and sale-disable rollback preserve webhook/recovery access.
- [ ] 8.3 Establish encrypted backups of the Good Apollo database and referenced Garage media to an independent off-VPS destination with at most a 24-hour loss window, a four-hour recovery target, and selected retention; verify a separate-environment restore loads a sample gallery, stock ledger, and historical order, and record the restore procedure/results in `docs/backup-restore.md`.
- [ ] 8.4 Connect the website's durable transactional outbox through a private authenticated adapter to the guarded Good Apollo Mautic delivery path; configure the sender identity and required DNS independently of Senna. Verify admin sign-in, buyer/operator confirmations, and tracking messages reach actual test recipients, and reconcile ambiguous provider outcomes before retries.
- [ ] 8.5 Enter final owner-supplied product descriptions, real photos, variant prices/counts, uniform U.S. shipping rate, processing window, and explicit tax configuration; verify every launch listing passes publication checks and no placeholder/guessed stock is saleable.
- [ ] 8.6 Review and update shipping, final-sale/support, contact, privacy, terms, FAQ, and product practical-details copy to match operations; verify consistent public wording and record the approved launch content in `docs/launch-checklist.md` without inventing a new returns policy.
- [x] 8.7 Add launch-aware robots/canonical/sitemap/product structured data with accurate prices/availability; verify public discovery remains disabled before launch and admin/cart/private/preview routes remain unindexed afterward.
- [ ] 8.8 Exercise database, Garage, and Mautic outage behavior plus bounded image/checkout/maintenance load in a production-like environment; verify checkout fails closed, unknown holds remain recoverable, no private data is cached/logged, other VPS services remain healthy, and container/disk limits are respected; record measured operating limits in `docs/store-operations.md`.
- [x] 8.9 Create the redacted release evidence packet and checklist with configuration owners, application revision, migrations, service readiness, alerts, restore references, missing owner inputs, and rollback procedure; verify each item points to observable evidence rather than a completed-looking assertion.

## 9. Cross-system acceptance and public launch

Covers integrated `production-readiness` and primary-operator acceptance across all six capabilities. This group broadens validation after each earlier group has landed its own tests/docs.

- [x] 9.1 Run the integrated test-mode merchandise lifecycle for a multi-product/multi-variant order through payment, notifications, packing, shipment, partial/full refund, dispute attention, and explicit eligible restocking; verify exact persisted totals/history and no unintended inventory movement. Evidence: `tests/commerce.test.ts` integrated lifecycle uses the isolated `_test` database and verifies $244.96 exact total, payment notifications, shipment, both refunds, dispute state, one returned-unit restock, three sale consumptions, and zero ledger drift.
- [x] 9.2 Run adversarial integration acceptance for the last-unit race, whole-cart failure, double submit, provider timeout/crash, missing/replayed/concurrent/out-of-order/mismatched webhooks, processing past expiry, and late payment without stock; verify all outcomes match the specs and ledger/order balances remain consistent.
- [ ] 9.3 Run mobile/desktop and keyboard operator acceptance with the owner's wife after a brief walkthrough: create/publish in ten minutes, edit in two, stock change and packing in five each; record observed timings/issues, fix any workflow failures, and verify independent completion.
- [ ] 9.4 Run the full documented validation suite and protected VPS deployment checks including auth denial, Garage photo processing, Mautic email recovery, independent restore, alerts, domain/HTTPS/redirects, performance/resource isolation, and indexing; verify other VPS services remain healthy, record results in the release packet, and resolve failures before sales.
- [ ] 9.5 At the actual release, verify production live Stripe mode/endpoint and final runtime configuration, enable public checkout/indexing together, and perform non-charging public smoke checks; verify published real stock, correct shipping/tax settings, healthy webhook/maintenance, and a documented rollback path without creating a synthetic real charge.
- [ ] 9.6 Record launch revision/time and perform the ordinary first-real-order operational check after an actual customer sale; verify payment, reserved/consumed stock, notifications, and packing agree and hand off the operator/operations guides with working support contacts.

- [x] 9.7 Produce and inspect a narrated internal studio walkthrough using the supplied hat photo and Justin/LuxTTS; demonstrate product/photo creation, stock/publication, storefront, real order queues and configurable settings, restore demo changes, and document any unshown provider/packing steps without claiming independent operator acceptance.

## 10. Owner-requested hats storefront refinement

- [x] 10.1 Display a single gallery photo from initial rendering, remove thumbnails, and retain previous/next, keyboard, touch and count controls.
- [x] 10.2 Place size/details in metadata and add horizontal padding to piece choices.
- [x] 10.3 Present only Hats in public collections and product category controls, preserve legacy category URLs with redirects, and align draft imports.
- [x] 10.4 Verify the standalone build and Google Chrome mobile/desktop gallery flow, metadata and legacy redirects.
