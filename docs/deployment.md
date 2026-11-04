# Production deployment

## Current production

- **Host:** Senna VPS (`senna-infra`), behind Traefik.
- **Public domain:** `goodapollogoods.com`; DNS resolves to `143.198.227.162`. `www` redirects to the apex.
- **Application:** `good-apollo-web`, running standalone Node image `gag-commerce:20261104T031223Z-06ee650ff29e` (latest recorded release: November 3, 2026, 10:13 p.m. America/Detroit).
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
