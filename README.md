# Good Apollo Goods

An Astro merchandise storefront and private studio admin for products, variants, photos, inventory and physical orders. The commerce implementation is local and **prelaunch**. Public sales default off; real provider, merchandise, operations and primary-operator acceptance gates remain in [the release checklist](docs/launch-checklist.md).

## Development

Requires Node 22.23.4+ in the 22.x line, PostgreSQL 16+, npm and Docker for isolated S3/mail.

```sh
nvm install && nvm use # when using nvm
npm ci
npm run local:setup
docker compose up -d
npx tsx scripts/setup-storage.ts
npm run db:migrate
npm run db:seed
npm run admin:bootstrap
npm run dev
```

On this Mac, local setup uses the existing Homebrew PostgreSQL service and creates independent development/test databases with a non-superuser role. On another machine, create equivalent databases and fill private `.env` from `.env.example`. Never copy Vesper's database, auth/session secrets or webhook secret. The seed creates private zero-stock drafts and preserves existing edits on repeat.

The studio is at `http://localhost:4371/admin/`; Mailpit is at `http://localhost:18025`. Bootstrap includes the primary `ADMIN_EMAIL` (`hello@annakahrs.com`) and optional comma-separated `ADDITIONAL_ADMIN_EMAILS`. The private local configuration currently includes `justin@justinkahrs.com` for testing. Both accounts need email sign-in and their own authenticator enrollment. Remove the testing address from the extra allowlist and restart when finished; existing sessions then lose admin access. Sign-in links use local mail; nothing is sent to a real inbox in local setup. Astro manages its development server in the background; `npx astro dev stop` stops this project's server.

```sh
npm test
npm run check
npm run build
npm run build:local
npx playwright install chromium
npm run test:browser
npm run start:local
npm run maintenance
```

Tests migrate and truncate only a localhost database whose name ends in `_test`. Browser tests use the standalone build on port 4372 and the same disposable test database; run them after integration tests, never concurrently. Provider fixtures exercise recovery and stock invariants; actual Stripe test-mode acceptance is separately required. The Dockerfile builds Astro's standalone Node adapter for the VPS. `build:local` and `start:local` validate that same runtime. CI uses disposable services. See [architecture/setup](docs/commerce-architecture.md) and [deployment](docs/deployment.md).

## Store operation

Products, Inventory, Orders and Settings are the main admin workflows. Upload JPEG/PNG/WebP photos, generate up to two variant options, enter dollar prices, count unsold stock and publish verified listings. Checkout reserves whole carts atomically, reconciles signed Stripe events and queues durable notifications. Packing, tracking, refunds and deliberate physical restocking preserve immutable purchase history.

Defaults are $6.95 uniform U.S. shipping including Alaska/Hawaii and 3–5 business day processing; both are configurable. Automatic tax is proposed-on but requires recorded verification. Shared Stripe routing is independently scoped to Good Apollo. The approved live key and dedicated Good Apollo webhook are configured and verified; the shared Stripe account remains named Senna Automation by owner decision. Sales remain disabled. Five-minute production maintenance and independent TrueNAS monitoring are active.

Read the [operator guide](docs/store-operator-guide.md), [Stripe setup](docs/stripe-setup.md), [operations](docs/store-operations.md), [backup/restore](docs/backup-restore.md) and [launch checklist](docs/launch-checklist.md).

## Design and code

- `src/styles/tokens.css` and `global.css`: existing brand, typography and responsive storefront foundations.
- `src/components/`: request-time catalog cards and shared Astro components.
- `src/server/`: validated server-only commerce, auth, inventory, photos and recovery boundaries.
- `src/client/`: bounded cart storage and progressively enhanced operator forms.
- `prisma/`: schema, migrations and database-enforced inventory/snapshot invariants.
- `src/data/products.ts`: original draft import source, never an authoritative saleable catalog.
- [Design system](docs/design-system.md) and `/design-system/`: visual guidance and foundations.

Catalog/home/shop/detail/admin/API/shipping pages render on demand. Informational pages remain static. Product images are processed during verified upload. Private responses are not cached or indexed; public discovery remains disabled until live launch.

## OpenSpec

Implementation is tracked in [launch-physical-merchandise](openspec/changes/launch-physical-merchandise/proposal.md), its [design](openspec/changes/launch-physical-merchandise/design.md), [specs](openspec/changes/launch-physical-merchandise/specs/) and [tasks](openspec/changes/launch-physical-merchandise/tasks.md). Saving code does not complete external launch or primary-operator acceptance tasks.

```sh
openspec status --change launch-physical-merchandise
openspec validate launch-physical-merchandise --strict --no-interactive
```

## Deployment

Production currently runs on the Senna VPS at `goodapollogoods.com`; pushing to GitHub does not deploy it. See [production deployment](docs/deployment.md) for the release path and its current manual step, and [the launch checklist](docs/launch-checklist.md) before enabling sales.
