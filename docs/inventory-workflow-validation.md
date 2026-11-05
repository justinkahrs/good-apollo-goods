# Inventory workflow verification

Updated November 04, 2026 at 11:26 PM EST (November 05 UTC). Change: `simplify-inventory-workflow`.

## Result

The inventory improvements are implemented, locally verified and deployed to the protected preview after Justin’s approval. Actual Garage uploads, cleanup recovery and Stripe Sandbox held-payment settlement passed. Production schema/content/image are unchanged. Sales and newsletter are disabled on both environments. OpenSpec is 25/26 tasks complete; independent primary-operator timed acceptance (6.4) remains open.

## Verified behavior

- One editor creates fixed-piece and two-option listings, accepts initial quantities and selected photos, and keeps prices/SKUs/stock identities stable. Product/photo/stock actions update in place without clearing other entries.
- Verified photos are visible by default, generated descriptions are editable, legacy hidden photos can be reviewed/shown, and failed files do not stop other valid files. Same-intent retries, limits, shared-copy and historical-order references, orphan cleanup and provider-failure recovery are covered.
- Structured drafts recover details, variant rows, unnamed generator tools and gallery state in the same tab. Conflict choices preserve newer saved data. Session expiry, unavailable browser storage, lost creation responses and typing during a pending save are exercised.
- Trash removes listings from normal views and new purchases; Restore returns a private draft. Guarded permanent deletion preserves history/audits. Existing held orders still settle, expire, ship, refund and explicitly restock correctly. Immutable snapshots, append-only stock, security and exports remain covered.

## Validation

| Check | Observed result |
| --- | --- |
| `npm test` | 94 passed across 7 files |
| `npm run check` | 0 errors, warnings or hints across 123 files |
| `npm run build:local` | Passed standalone Node build |
| `npm run test:browser` | 18 passed in Google Chrome (single-save refinement) |
| `npm run build` | Passed configured Vercel adapter build |
| `npx tsx scripts/verify-inventory-migration.ts` | Passed transaction-local temporary fixture backfill; shared references, hidden state, alt source and unique bytes preserved |
| Strict OpenSpec validation | Both this change and `launch-physical-merchandise` passed |
| `git diff --check` | Passed |

Tests ran sequentially against localhost PostgreSQL with a database ending in `_test`; browser and integration tests were not run concurrently. The local suite uses deterministic Stripe fixtures and temporary S3-compatible storage. Separate real Garage and Stripe Sandbox evidence is recorded below. The existing eight-hour operator authentication checks remain in place.

## Evidence and reproduction

Base commit: `c1197bdeb92027dd096f62dfd6a64f748a01a206`. Application/configuration/migration/script/test source hash (sorted path + NUL + bytes + NUL): `aca955b682cbad18657d5b2885eab7751da4f39dcc31c72c45b7ac456f79ddc4`. This source is committed in preview application revision `4cf0ad091542c4aa8110c84c493c6c463a44a0f4` on `jk/simplify-inventory-workflow`. The ignored manifest `output/validation/inventory-source-manifest.json` enumerates 143 files.

Ignored logs: `output/validation/inventory-tests.log`, `inventory-check.log`, `inventory-build.log`, `inventory-browser.log`, `inventory-production-build.log`, and `inventory-migration.log`. Synthetic screenshots include `output/playwright/inventory-baseline.png`, `inventory-editor-mobile.png`, and existing desktop/mobile editor/gallery evidence. Baseline code captured in `output/validation/inventory-baseline.spec.txt` reproduced the five reported workflow problems before rebuilding the application.

The previously configured localhost photo service was absent. Verification used a temporary `s3rver@3.7.1` process bound to 127.0.0.1:19000, with its public fixture credentials injected only into test commands and an ignored local data directory. It is not an application dependency or an installed background service. Test commands require a running isolated S3 service with matching runtime environment settings. The temporary process is stopped after verification.

## Approved preview release and real runtime evidence

Justin approved isolated preview migration/deployment on November 4. The protected site is https://preview.goodapollogoods.com. Initial application revision `4cf0ad091542c4aa8110c84c493c6c463a44a0f4` ran as `gag-commerce:inventory-preview-20261105-4cf0ad0`, image ID `sha256:46a4532cab65e18344331bba475ffd6aa74972031595948be98cafb7a36f567d`. The additive migration `20261105021500_inventory_workflow` was applied using the preview migrator; only the three new preview tables received runtime grants.

Checkpoint `gag-inventory-preview-20261105T031552Z` was captured with preview paused and independently restored before migration: 27 database tables plus shared Garage media and private configuration, in disposable network-none containers without published ports or provider/production writes. Encrypted artifacts and the restore receipt are retained in the managed recovery ledger and ignored local mirror. Technical release acceptance was recorded in the checkpoint ledger after live verification; this does not claim independent operator acceptance. Rollback requires deletion-aware compatible code; never restore this checkpoint over newer orders.

| Actual preview check | Observed result |
| --- | --- |
| Real email-link sign-in and TOTP | Passed normal sign-in and authenticator enrollment/step-up in Google Chrome; delivery captured by preview Mailpit |
| One editor and actual Garage uploads | Created a synthetic listing with two queued photos and five initial pieces; later uploads retained unsaved description/price, and inline stock increased to seven without a routine reload |
| Published-photo visibility and alt | Four verified real uploads; fresh public media request returned 200 within 1.82 seconds including upload/processing; generated descriptions required no typing |
| Hidden-photo recovery | Saved an explicitly hidden synthetic copy photo, reloaded, reviewed its retained preview, explicitly showed/saved it; owner photos untouched |
| Duplication and shared media | Copy had independent zero stock; removing one reference retained the shared Garage objects |
| Durable cleanup recovery | Removed the last synthetic gallery reference, simulated an unreachable storage endpoint only in the scoped verification process, verified durable retry, then restored the endpoint and deleted all four unreferenced objects successfully |
| Trash/restore and held checkout | Trash blocked a new quote with 409; restore returned Draft; the already-reserved real Stripe Sandbox session paid after the listing returned to Trash |
| Settlement and order retention | Exactly one consumption left six unsold/zero held; duplicate provider reconciliation caused no extra consumption; original $56 terms remained immutable; removing both gallery references retained the purchased image asset and all real Garage objects |
| Synthetic cleanup and delivery | Full real Sandbox refund succeeded without implicit restocking; audited adjustment removed remaining synthetic stock; both synthetic listings retained safely in Trash; buyer/operator outbox rows delivered to isolated Mailpit |
| Existing data and health | Original Product, Variant, StockBalance, StockMovement, Order, OrderItem and gallery signatures unchanged; maintenance completed with zero failures and zero drift, overdue holds or repeatedly failed mail |
| Gates and production | Both sales/newsletter gates false; production image remains `gag-commerce:20261104T035933Z-c1197bdeb920`; public `/` and `/admin/sign-in/` return 200, `/admin` and `/admin/` redirect to sign-in |

The deployed preview sales gate stayed false throughout. Creating the one exact synthetic reservation used `SALES_ENABLED=true` only inside an isolated, non-routed verification process guarded to the preview database/bucket, Stripe test key and Mailpit. No public checkout gate was opened, real card charged or external mail sent. There was no missed authorized delivery; both synthetic order messages delivered successfully.

Private runtime evidence and scripts are ignored under `output/preview-release/` and `.local/`; server evidence is retained under `.runtime/good-apollo/inventory-preview-20261105`. Verification credentials and encrypted operator recovery were saved in the dedicated agent Vaultwarden account, separate from production authentication.

## Operator authenticator handoff

During operator handoff, Justin’s production phone code did not match the separate preview enrollment created during agent verification. The developer confirmed the preview enrollment matched the saved agent enrollment, removed it through Better Auth’s native authenticated disable API, revoked preview step-up grants, and recorded requested/completed recovery audits. Production authentication was untouched. A fresh real email-link Chrome session showed **Set up authenticator**, and protected access remained denied pending the operator’s own enrollment. No replacement authenticator was created by the agent. The handoff returned phone enrollment to Justin; the subsequent single-save deployment preserved the operator’s authenticator record exactly. Independent inventory acceptance remains open.

## Remaining acceptance boundary

Independent Anna desktop/mobile/keyboard timing remains unchecked: fixed listing with three photos/stock within five minutes excluding transfer, two-option listing within ten, edit within two, stock adjustment within one. These timings cannot be claimed from agent-operated Chrome checks. Production migration/deployment, launch activation and unrelated checklist gates remain separately authorized work. Keep the OpenSpec change active until operator acceptance is recorded.

## Single-save refinement — November 4, 2026

Justin requested one save action after preview review. The editor now offers **Create listing** before creation and **Save changes** afterward, with Visibility selecting Draft, Published or Archived. There are no separate draft/product/photo-save buttons. The same action saves details and staged gallery metadata, creates the private identity before uploading new files, then applies the requested visibility. Upload failures retain the private identity and initial stock exactly once; later typing stays unsaved through the publication pipeline. Photo controls support submitting the same listing form from the keyboard. Previously uncertain photo-save receipts remain reconcilable.

The revised local run passed 94 domain/integration tests and 18 Google Chrome tests, Astro checking and both adapter builds. Added Chrome cases cover one-click creation/publication with three photos/stock, keyboard combined detail/gallery saving back to Draft, failed-file recovery without duplicate identity/movements, and typing during upload without accidental publication. `output/validation/single-save-*.log` holds the final sequential validation logs. The first browser attempt exposed an older test that left an unsupported file queued before publishing; it now explicitly removes that failed file. A prematurely overlapping adapter build was stopped and the complete standalone build/browser/configured-build sequence rerun successfully.

The refinement is deployed on protected preview at application revision `19626e477fcc58678e6118261d705cd3a7995626`, image `gag-commerce:inventory-preview-20261105-19626e4`, image ID `sha256:c273f484fe56391e87195b59be2054463897556d6a063d463a2c876ef02537fd`. Current source hash is `a09ce9838ecf8c63d84da9913a72936d9933644c308258e831ba3dea9ac1be1d` over the 143 files in ignored `output/validation/single-save-source-manifest.json`. No schema changes were required.

Code-only checkpoint `gag-single-save-preview-20261105T042202Z` encrypted the existing preview image pointer and independently restored that file archive in network-none resources before the rollout. The prior image remains retrievable. The deployed server template contains the unified control and no old save controls. A Google Chrome check fetched the live editor asset and matched its SHA-256 to the running image; storefront/sign-in returned 200 and both unauthenticated admin paths redirected correctly. The runtime environment, BasicAuth users, operator authenticator records and production image were unchanged. Both preview gates remain disabled. Independent authenticated operator testing of the refreshed editor remains part of task 6.4; this release verification did not enroll or alter the operator’s phone.
