# Inventory workflow verification

Recorded November 04, 2026 at 09:53 PM EST. Change: `simplify-inventory-workflow`.

## Result

The inventory improvements are implemented and verified locally. The application has not been deployed and no production schema/content was changed. Sales and newsletter gates were not enabled. The two remaining OpenSpec tasks are authorized preview/schema rollout with actual Garage verification (6.3) and independent primary-operator timed acceptance (6.4).

## Verified behavior

- One editor creates fixed-piece and two-option listings, accepts initial quantities and selected photos, and keeps prices/SKUs/stock identities stable. Product/photo/stock actions update in place without clearing other entries.
- Verified photos are visible by default, generated descriptions are editable, legacy hidden photos can be reviewed/shown, and failed files do not stop other valid files. Same-intent retries, limits, shared-copy references, orphan cleanup and provider-failure recovery are covered.
- Structured drafts recover details, variant rows, unnamed generator tools and gallery state in the same tab. Conflict choices preserve newer saved data. Session expiry, unavailable browser storage, lost creation responses and typing during a pending save are exercised.
- Trash removes listings from normal views and new purchases; Restore returns a private draft. Guarded permanent deletion preserves history/audits. Existing held orders still settle, expire, ship, refund and explicitly restock correctly. Immutable snapshots, append-only stock, security and exports remain covered.

## Validation

| Check | Observed result |
| --- | --- |
| `npm test` | 93 passed across 7 files |
| `npm run check` | 0 errors, warnings or hints across 123 files |
| `npm run build:local` | Passed standalone Node build |
| `npm run test:browser` | 15 passed in Google Chrome |
| `npm run build` | Passed configured Vercel adapter build |
| `npx tsx scripts/verify-inventory-migration.ts` | Passed transaction-local temporary fixture backfill; shared references, hidden state, alt source and unique bytes preserved |
| Strict OpenSpec validation | Both this change and `launch-physical-merchandise` passed |
| `git diff --check` | Passed |

Tests ran sequentially against localhost PostgreSQL with a database ending in `_test`; browser and integration tests were not run concurrently. Stripe behavior is deterministic provider fixtures, not a real hosted-provider acceptance claim. Photo processing and HTTP image serving used temporary local S3-compatible storage, not the actual Garage preview bucket. The existing eight-hour operator authentication checks remain in place.

## Evidence and reproduction

Base commit: `c1197bdeb92027dd096f62dfd6a64f748a01a206`. Application/configuration/migration/script/test source hash (sorted path + NUL + bytes + NUL): `4dff528afdf4875b8d9a6717721280be8ca9a3cb45c9c3eefa72394e5802a64a`. This describes an uncommitted implementation, not a deployed release. The ignored manifest `output/validation/inventory-source-manifest.json` enumerates 143 files.

Ignored logs: `output/validation/inventory-tests.log`, `inventory-check.log`, `inventory-build.log`, `inventory-browser.log`, `inventory-production-build.log`, and `inventory-migration.log`. Synthetic screenshots include `output/playwright/inventory-baseline.png`, `inventory-editor-mobile.png`, and existing desktop/mobile editor/gallery evidence. Baseline code captured in `output/validation/inventory-baseline.spec.txt` reproduced the five reported workflow problems before rebuilding the application.

The previously configured localhost photo service was absent. Verification used a temporary `s3rver@3.7.1` process bound to 127.0.0.1:19000, with its public fixture credentials injected only into test commands and an ignored local data directory. It is not an application dependency or an installed background service. Test commands require a running isolated S3 service with matching runtime environment settings. The temporary process is stopped after verification.

## Remaining release boundary

The additive migration `20261105021500_inventory_workflow` is prepared and verified only on disposable/temporary fixtures. Follow `docs/deployment.md` for the separately approved preview/schema rollout and compatibility rollback. Do not roll back to code that ignores Trash state. Preserve existing launch gates; local tests do not establish actual Garage/provider readiness or Anna's independent five/ten/two/one-minute operator acceptance targets.
