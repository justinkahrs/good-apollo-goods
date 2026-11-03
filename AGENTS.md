# Good Apollo Goods repository guide

## Purpose and current state

Good Apollo Goods is a small-batch physical merchandise storefront. The primary operator must be able to manage products, variants, descriptions, photos, inventory, and orders through a simple admin interface.

The application uses Astro with on-demand commerce/admin routes and static informational pages. PostgreSQL/Prisma owns catalog, variant stock, immutable orders and durable payment/email recovery. `src/data/products.ts` is a draft-only import source; the browser cart contains requested variant IDs and quantities. The application remains prelaunch with sales disabled until the evidence checklist passes. Preserve the existing brand, design tokens, URLs and accessibility.

## OpenSpec assistant behavior

Natural-language requests are enough to select OpenSpec skills:

- Exploring ideas, requirements, or tradeoffs: `openspec-explore`.
- Creating a proposal, spec, design, or tasks: `openspec-propose`.
- Revising an existing change: `openspec-update-change`.
- Implementing tasks from a change: `openspec-apply-change`.
- Syncing delta specs: `openspec-sync-specs`.
- Archiving completed changes: `openspec-archive-change`.

Read the selected skill's `SKILL.md` fully before using it. OpenSpec configuration and planning under `openspec/`, generated skills under `.agents/skills/openspec-*/`, and this guide are repository documentation intended for version control, as authorized by the owner's September 30, 2026 planning request. Do not ignore those paths. Saving documentation does not authorize staging or committing it automatically.

## Runtime and validation

- Node.js 22.x, at least 22.12; npm and `package-lock.json`.
- `npm ci` installs dependencies.
- `npm run dev` starts Astro development at localhost:4371; Astro manages its background server (`npx astro dev stop` stops this project's server).
- `npm run db:migrate`, `npm run db:seed`, and `npm run admin:bootstrap` prepare the isolated development environment.
- `npm test` runs domain/integration tests only against a localhost database ending in `_test`; never use customer data.
- `npm run check` runs Astro checking.
- `npm run build:local` followed by `npm run test:browser` verifies browser workflows on port 4372 using only the disposable `_test` database. Never run concurrently with integration tests.
- `npx tsx scripts/restore-drill.ts` creates separate local synthetic source/restore databases and media buckets; the encrypted drill never changes the development store or Vesper.
- `npm run build` checks the configured adapter; the production `Dockerfile` explicitly selects the standalone Node adapter with `GAG_VPS_RUNTIME=true` and runs `npm run db:generate` so the Prisma client is present in the image. `npm run build:local` and `npm run start:local` validate that same standalone runtime.
- `npm run maintenance` runs persisted provider/outbox recovery. The planned authenticated five-minute scheduler is `~/projects/infra/n8n/workflows/good-apollo-goods/maintenance.sdk.js`; it is source-only and must remain inactive until production commerce is configured.
- The selected commerce host is the existing `senna-infra` VPS behind Traefik, with isolated Good Apollo roles/database on shared PostgreSQL, Garage media, and the guarded Good Apollo Mautic route. Public DNS cutover and removal of old hosting bindings happen only after the VPS site is confirmed live. Keep sales disabled through the evidence checklist. See `docs/deployment.md`, `docs/commerce-architecture.md`, and `docs/launch-checklist.md`.
- Validate OpenSpec changes with `openspec validate <change-name> --strict --no-interactive`.
- Update these facts when commerce implementation changes the runtime, scripts, or deployment output.

## Commerce implementation guidance

- Use `/Users/justin/Projects/vesper` as a read-only implementation reference. Adapt its tested payment, authentication, upload, and audit patterns to physical merchandise; its digital download inventory is not a stock system.
- Keep Good Apollo data, auth sessions, Stripe webhook routing, storage and order history independently scoped. Never copy Vesper's database, session, auth or webhook secrets or customer data. Shared provider credentials may be reused only when explicitly authorized by the owner, through ignored private environment files.
- Resolve price, publication state, variant identity, quantity limits, and available stock on the server. Browser cart content is a request, not authority.
- Use integer minor units for stored money and atomic database transactions for stock movements.
- Preserve immutable order snapshots, idempotent signed payment processing, and an auditable stock ledger. A success redirect does not prove payment; a refund does not prove physical stock was returned.
- Product changes and stock adjustments must appear without asking the operator to edit source or redeploy.
- Keep secrets out of tracked files and outputs; use placeholder-only environment examples. Production infrastructure changes and real sales are separate implementation and launch work.

## Existing documentation

`docs/design-system.md` describes the brand and UI. `docs/deployment.md` preserves historical deployment records and the new commerce release/rollback procedure. Keep both consistent with implemented behavior.
## OpenSpec Jira / Confluence Sync

This canonical checkout syncs OpenSpec to Jira project `GAG` and the `Good Apollo Goods`
Confluence space. Config: `~/projects/openspec-jira-sync/configs/good-apollo-goods.json`.

Local OpenSpec is authoritative. Changes map to Jira epics and task checkboxes map
to Jira tasks. The project Confluence space has Specifications, Active changes,
and Archived changes; each change has its own proposal, design, tasks and delta-spec
pages. Page titles use readable labels without OpenSpec prefixes or `.md`.

Publish during active OpenSpec work only: after creating/revising coherent planning
artifacts, after each completed implementation task batch before the next progress
report or ending the turn, after syncing delta specs or archiving, and at the start
of an active session when a prior sync is known pending. Use this command:

```sh
python3 ~/projects/openspec-jira-sync/sync.py sync --config ~/projects/openspec-jira-sync/configs/good-apollo-goods.json
```

Do not install a polling watcher, login service, timer, scheduled scan or background
retry. Do not run simultaneous writers from different worktrees. If another sync
holds the project lock, retry once it finishes. Report failed syncs as pending, and
reconcile uncertain creates against provider receipts before retrying. Never delete
the durable `.state/` ledger. Keep credentials in `~/projects/.env`; never copy
them into this repository. No paid features, trial, additional users or Jira
automation rules are needed or authorized.

