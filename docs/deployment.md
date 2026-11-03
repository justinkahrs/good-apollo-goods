# VPS hosting and GoDaddy DNS

## Selected production architecture

The selected commerce host is the existing `senna-infra` VPS. Good Apollo runs as a capped standalone Node container behind Traefik, using only its isolated `good_apollo_goods` database and `good_apollo_app`/`good_apollo_migrator` roles on shared PostgreSQL. Its five-minute maintenance workflow is installed in the existing Senna n8n instance and remains inactive pending protected-preview acceptance. Media uses a private, dedicated Garage bucket. The Good Apollo transactional outbox signs requests to a separate private Mautic gateway route; its durable mail ledger is deployed with the commerce gate disabled. Keep sales and newsletter gates disabled.

## Most recent production state (October 18, 2026, 03:16 UTC)

The apex and `www` resolve to the VPS and use valid HTTPS certificates. The AMD64 app image is `gag-commerce:20261017-commerce-mail`; the private Garage production bucket and Mautic gateway are running. The Settings page's HTTP 500 was caused by a missing `StoreSettings` row. A scoped encrypted checkpoint, `gag-store-settings-repair-20261018T0255Z`, was captured before initializing it; one PostgreSQL database and three media/configuration archives restored in isolation, and all four temporary containers and volumes were removed. The checkpoint is accepted in the local lifecycle ledger.

The authenticated admin Settings form now records $6.95 flat U.S. shipping, 3–5 business day processing, Stripe automatic tax enabled, and the owner's October 17 confirmation that tax is registered and ready. The checkout flag remains disabled. Gina Hat is published as a directly accessible, noindex production listing at $85, size 60 cm, one available, with the supplied photo and owner-editable image-based copy. Its purchase action says “Collection opening soon” while sales are disabled. The apex homepage, `/shop/`, and `/pieces/gina-hat/` return HTTP 200; `/robots.txt` disallows indexing. `/api/health/` still returns HTTP 503 `attention` because maintenance is stale. The scheduler remains inactive while preview/provider acceptance is open.

The app outbox contains one old sign-in retry without a Mautic/Gmail provider receipt. Its 15-minute link has expired, so it is not eligible for delivery; the other six messages have provider acceptance records. No eligible missed delivery was found. A local change and regression test now expire stale sign-in retries before provider contact; that code change has not been deployed. Production remains sales-disabled, and Vercel is retained for rollback while the preview, maintenance, alert, backup, content, and owner-acceptance gates remain open. The host disk was last observed at 83% used, below Beszel's 90%-used warning threshold.

The local validation suite passes 79 tests across seven files, Astro reports zero diagnostics, the standalone Node build passes, and all nine browser scenarios pass against the isolated `_test` database. The added integrated lifecycle test covers a multi-product/multi-variant order, exact totals, local notification delivery, shipment, partial and full test-fixture refunds, dispute attention, one eligible returned unit, and zero stock-ledger drift. These results do not replace the protected VPS preview or real provider/inbox acceptance.

Build with the repository `Dockerfile`, which selects Astro's standalone Node adapter, runs `npm run db:generate`, then builds with `GAG_VPS_RUNTIME=true`. Apply migrations with the separate migrator identity before promoting the image. Keep runtime credentials in the private Infra environment, never in this repository. Resource caps and storage capacity protections must be verified against the rest of the VPS before sales.

The records below describe prior Netlify/Vercel deployments and DNS recommendations. They are retained as history only; do not apply their DNS values to the selected VPS architecture.

## Historical Netlify/Vercel deployment and DNS records

## Current Netlify deployment

On October 16, 2026, the application was deployed to a new Netlify site:

- Netlify project: `good-apollo-goods-shop` (`67ef9422-b0c3-4e76-97ce-67f9425d23c6`)
- Review URL: https://good-apollo-goods-shop.netlify.app/
- Deployment: `6ad28e8db1de6921967e645a`
- Astro's Netlify adapter packages request-time routes as a Netlify SSR Function. `netlify.toml` sets `GAG_NETLIFY=true` so Netlify builds select that adapter.

The homepage and `/shop/` returned HTTP 200 after deployment. `/api/health/` reported checkout unavailable and `/admin/` returned HTTP 503 because production database and Stripe credentials are not configured in Netlify. Sales remain disabled. Configure isolated production services and complete `docs/launch-checklist.md` before enabling commerce. This deployment uses the site's `netlify.app` address; no custom domain or DNS was changed, and the existing Vercel project was not modified.

## Existing domain and Vercel project records

Original static hosting configured September 8, 2026. Commerce source added September 30, 2026. The following Vercel project and domain details are historical and must be rechecked before any DNS change.

- Vercel project: `good-apollo-goods` in `justinkahrs-projects`
- Working production URL: https://good-apollo-goods.vercel.app/
- Primary domain: https://goodapollogoods.com/
- Redirect: `www.goodapollogoods.com` → `goodapollogoods.com` (HTTP 308)
- Domains are attached and verified for use by this Vercel project. DNS still needs to point to Vercel.

## Continuous deployment

Connected September 15, 2026.

- GitHub repository: `justinkahrs/good-apollo-goods`
- Production branch: `main`
- Every push to `main` triggers a Vercel production deployment.

## GoDaddy records

Open GoDaddy Domain Portfolio → **goodapollogoods.com** → **DNS**. Keep the existing GoDaddy nameservers (`ns21.domaincontrol.com` and `ns22.domaincontrol.com`).

Replace the existing website records with these values returned by Vercel for this project:

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| A | `@` | `216.198.79.1` | 1 hour |
| A | `@` | `64.29.17.1` | 1 hour |
| CNAME | `www` | `b753e17f3a06fa4b.vercel-dns-017.com` | 1 hour |

Edit the two existing apex A records, currently `76.223.105.230` and `13.248.243.5`, to use the two Vercel values above. Edit the existing `www` CNAME, currently `goodapollogoods.com`, to the hostname above. Do not leave the parking IPs alongside the new records. Preserve unrelated email and verification records.

No ownership TXT record was requested by Vercel. Both A values are preferred Vercel targets; its API also allows using only one preferred IP.

Vercel will validate DNS and issue HTTPS certificates after the records propagate. GoDaddy says this usually takes effect within an hour, but can take up to 48 hours globally. The Vercel-hosted URL works during this process.

## Historical static validation

- Vercel production deployment reached `READY` after Astro type checking and static build succeeded.
- Home, design-system, and a sample-product route returned HTTP 200.
- A nonexistent route returned the custom HTTP 404 page.
- Canonical URLs use `https://goodapollogoods.com`.
- Sample content remains marked `noindex, nofollow` pending launch.

## References

- [GoDaddy: add or edit an A record](https://www.godaddy.com/help/add-or-edit-an-a-record-42546)
- [GoDaddy: edit a CNAME record](https://www.godaddy.com/help/edit-a-cname-record-19237)
- [Vercel: set up a custom domain](https://vercel.com/docs/domains/set-up-custom-domain)

Recheck Vercel's Domain Settings if configuring DNS at a later date; provider recommendations can change.

## Historical hosted-runtime notes

`npm ci` generates the pinned Prisma client. The prior Netlify and Vercel deployments used their respective Astro adapters. Production commerce now targets the standalone Node container described above.

Set independently scoped production and protected-preview environments using `.env.example` and `docs/commerce-architecture.md`. Preview must use separate test data/media/auth secrets and Stripe test mode; never Vesper or production inventory. Do not upload `.env`, `.local`, browser auth artifacts, exports or backups. `.vercelignore` explicitly excludes them. `VERCEL_TOKEN` was for historical deployment tooling only and is not an application runtime variable.

The five-minute `/api/maintenance/` schedule is installed in the existing Senna n8n instance as `GOOD APOLLO - Commerce Maintenance`, with the matching `CRON_SECRET` bearer credential. Its source is `~/projects/infra/n8n/workflows/good-apollo-goods/maintenance.sdk.js`; it calls the app over the private Docker network. Keep the workflow inactive until separate preview data/payment configuration, Mautic sender/inbox verification, scoped restore, and alert evidence are ready. The app-to-Mautic private route, shared HMAC, send-only Gmail credential, and additive gateway migration are deployed. The commerce gate is closed. Do not run two schedulers at once. Configure an independent uptime monitor for `/api/health/` and exercise alerts. In the preview, verify database pooling/TLS, authenticated same-origin Garage uploads, private media access, sender DNS/inbox delivery and app/service resource limits. The October 17 hostname cutover is recorded below; no real sale has been made.

### October 17, 2026 production hostname and admin sign-in

The owner-authorized GoDaddy cutover points the apex A record to the Senna VPS
and `www` to the apex. Let's Encrypt certificates validate for both hostnames;
the storefront and `/admin/sign-in/` return HTTP 200, and `www` redirects to
the apex. The Justin admin address is allowlisted and bootstrapped. After
checking the transactional outbox and provider ledger, one new sign-in link was
accepted by Gmail and marked delivered in both ledgers. The commerce email gate
was closed immediately afterward. Inbox arrival and link use remain
unverified. `SALES_ENABLED=false` and `NEWSLETTER_ENABLED=false` remain in
effect. The health route currently returns 503 `attention` because maintenance
is stale; the five-minute workflow remains inactive. The encrypted checkpoint
`gag-admin-hostname-prechange-20261017T160841Z` passed isolated restore and
cleanup. Keep Vercel available for rollback until health, authenticated admin,
customer-flow and remaining production checks pass and the rollback window
closes; keep Netlify as the canary.

Follow `docs/launch-checklist.md` before promoting live sales. Confirm actual provider mode/endpoint/version, verified real product photos/prices/counts, shipping/tax decisions, owner-reviewed policies, restore evidence and primary-operator timed acceptance. Enable checkout/discovery in the approved production release; use non-charging smoke checks. Do not generate a synthetic real sale.

## Newsletter integration status

Newsletter signup is implemented as a separate, default-off feature. The Astro
server calls the private Infra/Mautic endpoint using `NEWSLETTER_API_URL` and
`NEWSLETTER_HMAC_SECRET`; configure separate values only in protected preview
and production environments. `NEWSLETTER_ENABLED` and
`NEWSLETTER_CONFIRMATION_DISPATCH_ENABLED` both default to false. The public
signup is hidden unless both are true. Never put the HMAC secret in browser
variables, client code, logs, this repository, or deployment output.

The site fails closed unless Infra acknowledges durable confirmation-queue
acceptance. The site sends the random token only in the signed server-to-server
request; Infra verifies the token hash and stores the token AES-256-GCM encrypted
under a separate protected runtime key. Infra's scoped recovery checkpoint and
closed Mautic/gateway rollout passed on October 17, 2026. The confirmation
encryption key and admission HMAC key are not provisioned, the Mautic confirmation
asset is still an unregistered draft, and the bounded internal acceptance has
not run. Keep both newsletter flags false and do not configure a public preview
integration until those gates pass and the owner authorizes that test.
Confirmation and unsubscribe remain server-to-server; GET pages do not change
permission. Newsletter sending is independent of the transactional email outbox
and commerce controls. No subscribers are imported. For rollback, turn both
newsletter flags off in the affected environment and redeploy. Keep the Infra
permission and withdrawal ledger intact; do not delete subscriber history or
replay pending newsletter work.

Rollback by disabling `SALES_ENABLED` and deploying/restarting that setting while preserving webhook/maintenance/provider/database access for existing sessions. Never reset stock, delete purchase history or restore an old snapshot over later orders as an automatic rollback.
