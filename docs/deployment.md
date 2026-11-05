# Production deployment

## Current production

- **Host:** Senna VPS (`senna-infra`), behind Traefik.
- **Public domain:** `goodapollogoods.com`; DNS resolves to `143.198.227.162`. `www` redirects to the apex.
- **Application:** `good-apollo-web`, running standalone Node image `gag-commerce:20261104T034528Z-76c9952aa7b3` (latest recorded release: November 3, 2026, 10:46 p.m. America/Detroit).
- **Data and services:** isolated `good_apollo_goods` PostgreSQL database, private Garage media bucket, and private Mautic mail gateway.
- **Business gates:** `SALES_ENABLED=false` and `NEWSLETTER_ENABLED=false`. Keep them closed unless the separate launch checklist is accepted.

## How a code change reaches production

Pushing to GitHub `main` **does not deploy the VPS**. The Vercel auto-deploy connection is historical/rollback capacity; it is not the current production release path.

The live app image and private runtime configuration are managed from the separate Senna Infra checkout. The compose service is in `~/Projects/infra/docker-compose.good-apollo.yaml`; its infrastructure setup runbook is `~/Projects/infra/docs/good-apollo-goods-deployment.md`.

**For a routine source change:**

1. Review the intended app diff, run relevant validation, commit the intended files, and push to GitHub `main`. A request to deploy authorizes the agent to complete this routine release without asking again. Preserve unrelated local work.
2. On Anna's Mac, run:

   ```sh
   cd ~/Projects/good-apollo-goods
   git switch main
   ./scripts/deploy-vps.sh
   ```

   The script requires a clean checkout exactly matching `origin/main`.
3. The script streams the committed source to the VPS, where Docker builds a unique AMD64 image. It updates only the Good Apollo image tag and recreates only `good-apollo-web`.
4. The script checks that Prisma migration files match the running image, verifies the storefront and admin sign-in return HTTP 200, confirms both business gates remain disabled, and restores the prior image if deployment or post-deploy verification fails.

Anna's VPS key is restricted to this Good Apollo deploy command. It does not provide an interactive shell or general Infra access. Docker runs the build on the VPS, so Docker Desktop is not needed on her Mac. The current script is for application changes without Prisma migration changes; migration releases still require the separate reviewed backup and migrator procedure. Keep the preceding image tag and the script's private `.env.runtime` backup for rollback.

## Release safeguards

- Do not change production database or media data for a UI-only release. Run migrations only when the change requires them, using the separate migrator identity and the reviewed backup/restore procedure.
- Never commit runtime credentials or private `.env` files.
- Do not disable webhook, maintenance, or recovery processing during a rollback. Disable new sales first if sales are ever enabled; never restore an old database snapshot over newer orders.
- Follow [the launch checklist](launch-checklist.md) before enabling checkout or public discovery.

For dated release records and obsolete hosting/DNS details, see [deployment history](deployment-history.md).

The deploy script automatically fast-forwards a clean main checkout when it is behind origin/main. The private runtime image setting contains only the tag suffix; Compose supplies `gag-commerce:`. Server-script changes must also be installed using Justin’s existing `senna-infra` access at `/home/senna/Projects/infra/.runtime/good-apollo/deploy-remote.sh`; Anna’s restricted deploy key does not grant this administration capability.

## Inventory editor migration and compatibility

The `20261105021500_inventory_workflow` migration adds product Trash state, generated/custom alt metadata, mutation receipts, shared media references and durable cleanup jobs. It does not change existing visibility or balances. Backfill groups already-shared originals into one asset and preserves nonempty legacy alt as custom; blank alt uses generated descriptions. Review legacy hidden photos explicitly rather than publishing them during migration.

Before production migration, validate a disposable copy for image/reference counts, distinct original/derivative keys, unique storage bytes, custom alt, hidden state, orders and append-only stock. Production schema rollout remains a separate approval boundary. Keep sales and newsletter gates disabled and retain existing maintenance/payment/email reconciliation.

Media cleanup runs through the existing maintenance lifecycle, without a new scheduler. Listing/photo removal commits reference changes first. Cleanup claims unreferenced assets and retries provider failures outside catalog transactions; copies, Trash references and immutable purchased image keys retain files. Keep byte accounting until cleanup succeeds. Inspect MediaCleanup retry status for a storage failure.

Rollback must retain deletion-aware public catalog, media and checkout filters. Do not deploy a historical binary that ignores deletedAt, because it can expose trashed listings. Use a compatibility release enforcing deletion filters while disabling editor mutations if necessary; preserve additive schema, mutation receipts, stock/order history and cleanup recovery. Never restore a pre-sale database over accepted orders.

## November 4 inventory preview release

Justin-approved preview migration `20261105021500_inventory_workflow` and application revision `4cf0ad0` are deployed on the protected preview as `gag-commerce:inventory-preview-20261105-4cf0ad0`. Managed checkpoint `gag-inventory-preview-20261105T031552Z` passed independent database/media/config restore before migration. Original preview catalog, gallery, order and stock signatures are unchanged; real Garage and Stripe Sandbox verification passed. Both preview business gates are disabled. Production remains at `c1197bdeb920`, without schema/content changes. See [inventory release evidence](inventory-workflow-validation.md). Independent primary-operator timings remain pending; this preview release does not authorize production migration or launch.

November 4 code-only refinement: protected preview now runs `gag-commerce:inventory-preview-20261105-19626e4` for the unified listing save action. No additional migration was applied. Checkpoint `gag-single-save-preview-20261105T042202Z` passed isolated image-pointer file restore; the prior preview image is retained for rollback. Live asset identity and HTTP checks passed, both gates remain disabled, and the operator authenticator and production image are unchanged.

November 4 sticky-panel refinement: preview now runs `gag-commerce:inventory-preview-20261105-8ed3a03`. Markup/CSS-only release, with no schema/auth changes. Checkpoint `gag-scroll-panel-preview-20261105T043847Z` passed isolated image-pointer restore; live CSS identity, server workspace and preview/production HTTP checks passed. Production and both disabled business gates are unchanged.

## Inventory production migration release procedure

Justin authorized deploying the inventory improvements to production after reviewing the protected preview on November 4. This includes the necessary `20261105021500_inventory_workflow` migration, with sales/newsletter remaining disabled. Independent timed operator acceptance and unrelated launch activation gates remain recorded separately.

The routine deploy script intentionally requires source migrations to match its running rollback baseline. For this schema release, first capture production PostgreSQL, shared Garage and private configuration as a managed encrypted checkpoint. Briefly stop production writes and cold-capture Garage, then immediately restart Garage/preview while production remains held for the restore check and migration. Restore the checkpoint into network-none disposable resources and apply the exact inventory SQL there; confirm original catalog/gallery/stock/order/auth signatures and backfill references before touching production schema.

Run the existing `good-apollo-migrate` and `good-apollo-grant-runtime` services with the verified inventory image and the dedicated production migrator configuration. Validate unchanged original signatures and new runtime table grants. Start those exact preview-verified application bytes under the production runtime as an `inventory-compatible-*` image, so rollback understands Trash state. This becomes the real running baseline; the migration-equality guard remains intact. Then run `./scripts/deploy-vps.sh` from reviewed clean `main` matching `origin/main`, which builds and releases the normal production image.

Justin’s Mac currently lacks Anna’s `senna-gag-deploy` SSH alias. A one-run ignored SSH adapter invokes the unchanged installed deploy entrypoint through Justin’s existing `senna-infra` connection, validates the exact deploy command shape, and delegates every other SSH call normally. It neither changes SSH configuration nor installs credentials. The installed entrypoint was byte-compared to `scripts/deploy-vps-remote.sh`. Keep checkpoint leases through the migration/staging operation, retain deletion-aware rollback bytes, and record actual production verification before accepting the checkpoint.
