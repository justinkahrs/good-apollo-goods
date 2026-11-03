# Proposal

## Why

Good Apollo Goods currently has a static catalog and preview cart, so it cannot safely take payment, track physical stock, or manage shipments. A small, understandable admin and reliable commerce backend will let the owner sell real merchandise and let his wife operate the store without editing code.

## What Changes

- Keep the existing Astro storefront, brand, and product URLs; run the Node standalone runtime on the existing VPS behind Traefik with explicit CPU/memory limits, and add the commerce database-backed routes.
- Reuse the shared PostgreSQL server only through the already isolated Good Apollo database and separate migration/runtime roles. Use a dedicated Garage S3-compatible bucket and scoped key for private product originals and derivatives, and route transactional email through the existing Good Apollo identity and guarded Mautic delivery path.
- Replace source-file catalog management with a simple admin for creating and editing products, descriptions, size/color variants, dollar prices, ordered photo galleries, and draft/published/archived state.
- Introduce per-variant stock, an auditable adjustment history, checkout reservations, low-stock views, and manual off-site sale/consignment adjustments.
- Replace the preview cart with validated variant quantities and Stripe-hosted guest checkout. All prices and stock come from the server; only verified payment processing commits a sale.
- Add shipping address/rate collection, explicit tax configuration, order confirmation, a paid orders-to-pack list, packing slips, tracking, and shipment email.
- Support payment reconciliation, exceptional refunds, cancellations, dispute attention, and deliberate physical restocking without conflating those actions.
- Adapt Vesper's authentication, Stripe, upload, audit, and email patterns; build physical-stock and fulfillment behavior separately.
- Add production configuration, isolated preview data, backups, recovery jobs, monitoring, operator documentation, and measurable launch acceptance.
- **BREAKING**: the old cart shape containing client prices and product slugs/sizes is replaced with versioned variant IDs and quantities. Legacy preview carts are cleared with an explanation; no draft item becomes saleable automatically.

### Launch scope and assumptions

Owner-confirmed scope: U.S. shipping only, guest checkout, ready-to-ship stock, and a simple Good Apollo admin using Vesper's existing patterns. Additional planning defaults: USD, one studio inventory location, and manual label purchase through the operator's preferred carrier service. Start with hats, while supporting other physical product categories and products with no selectable options. Use card payments and eligible card wallets at launch; delayed payment methods are disabled, with defensive handling for unexpected pending payments.

The selected management approach is a Good Apollo admin with three main sections: Products, Inventory, and Orders. One uniform U.S. shipping service is the planning default; shipping charge, processing promise, tax setup, and product data remain explicit launch inputs. No rate, stock count, tax registration, or policy approval is invented by this plan.

### Non-goals

Customer accounts, digital download entitlements, subscriptions, discount codes, international shipping, pickup, preorders, made-to-order scheduling, exchanges, automated labels, warehouse/POS integration, full consignment accounting, and a storefront redesign are outside the initial launch. Recording stock removed for an off-site sale or consignment is included. The owner requested visual refinement of the studio product editor and a default workflow for one fixed piece; optional variants remain supported.

### Measurable success

- After a brief walkthrough, the primary operator independently creates and publishes a product with two options, prices, stock, and at least three real photos in ten minutes; edits an existing description/photo in two minutes; records stock and packs a test order in five minutes each.
- Product edits and stock changes appear on a fresh storefront request within five seconds without rebuilding or redeploying.
- Two concurrent checkouts for the last unit produce at most one active payable session; retries and duplicate/out-of-order webhooks never double-charge through duplicate sessions or double-adjust stock.
- A test payment creates one paid, packable order with exact variants, shipping address, and reconciled totals; shipping it sends one tracking notification. Abandoned/failed checkouts recover safely; refunds do not automatically add stock.
- Commerce/security tests, mobile and keyboard operator acceptance, a production-like deployment, and a database-plus-photo restore exercise pass before public sales are enabled.

## Capabilities

### New Capabilities

- `merchandise-catalog`: operator-managed products, variants, prices, photos, publication, and live storefront content.
- `inventory-control`: variant balances, adjustments, atomic checkout holds, consumption, release, and stock recovery.
- `stripe-checkout`: authoritative cart quotes, guest payment sessions, verified idempotent payment handling, and protected order status.
- `order-fulfillment`: paid-order operations, shipping/tax snapshots, packing, tracking, notifications, refunds, and restocking separation.
- `store-administration`: secure operator access, usable workflows, validation, conflict handling, audit, and exports.
- `production-readiness`: environment isolation, deployment, maintenance, backups, launch content, monitoring, and acceptance evidence.

### Modified Capabilities

None. This repository has no existing OpenSpec capability specs.

## Impact

Affected files include `astro.config.mjs`, `package.json`, the VPS Compose/Traefik deployment files, `src/data/products.ts`, catalog-consuming components/pages, `src/pages/pieces/[slug].astro`, `src/pages/cart.astro`, and `src/layouts/Layout.astro`. New modules/routes own persistence, admin/auth, uploads, inventory, payments, orders, maintenance, and email. Documentation and environment examples will describe the resulting runtime when implemented.

Likely additions are the Astro Node adapter, Prisma/PostgreSQL, Stripe SDK, Better Auth, runtime validation, S3-compatible object storage/image processing, transactional email delivery integration, and meaningful commerce/browser tests. Runtime versions must be checked against the installed Astro 7 toolchain before adoption.

Good Apollo uses its existing isolated database and runtime/migration identities on shared PostgreSQL, a dedicated Garage bucket/key, its registered Mautic sender identity and guarded delivery path, independent Stripe webhook/mode configuration, and its admin bootstrap. Run the app and storage with resource/disk limits so they cannot consume unbounded VPS capacity; keep production sales disabled until performance, isolation, delivery, backup/restore, and launch acceptance are evidenced. The existing Senna n8n instance remains the five-minute maintenance scheduler. The shared Stripe account still requires store-specific event routing and metadata. Record the VPS capacity budget and storage/backup limits before launch; do not add a paid hosting or storage plan as part of this decision.
