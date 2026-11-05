# Tasks

Implementation tasks are checked only after their recorded verification; external runtime and operator acceptance remain pending. Requirement names below refer to the three specs in this change. Keep sales/newsletter disabled and existing launch evidence gates open.

## 1. Baseline evidence and compatible data foundations

- [x] 1.1 Reproduce published-photo hiding, cross-form reload interruptions, separate stock navigation, manual-alt publication blocking, and missing listing deletion in Chrome using isolated synthetic localhost `_test` data; record action/outcome evidence without owner data (Complete listing workspace; Independent actions preserve working edits).
- [x] 1.2 Add nullable product deletion state, generated/custom alt metadata, actor-bound mutation receipts, shared media-asset references, and durable cleanup jobs; verify additive migration/backfill on a disposable database preserves counts, references, visibility, custom alt, immutable history, and unique-byte accounting (Recoverable listing deletion; Automatic editable photo descriptions; Guarded permanent removal and media cleanup).
- [x] 1.3 Implement shared product lifecycle locking and consistently ordered product/stock locks for saves, new checkout eligibility/reservations, deletion, and upload lifecycle; add integration tests for stale saves and checkout/upload/delete races with no resurrection, deadlock, or post-delete reservation (Recoverable listing deletion; Preserve commerce stock lifecycle during listing management).
- [x] 1.4 Document schema/backfill compatibility and rollback in `docs/deployment.md`; verify the rollback plan preserves deleted-product exclusion and durable cleanup rather than exposing trashed listings (Recoverable listing deletion; Guarded permanent removal and media cleanup).

## 2. Reliable server saves and inline stock operations

- [x] 2.1 Add idempotent creation/combined save and canonical mutation-result responses, binding operation IDs to actor/entity/payload and returning structured conflict/current-state information; test lost responses, payload mismatch, duplicate clicks, transaction rollback, and stale revisions (Clear publication and save feedback; Recover editor drafts against current server state).
- [x] 2.2 Accept initial quantities for new product/variant identities through existing ledger helpers, with zero default and stable movement keys; test invalid-count atomic rollback, replay, multi-variant creation, existing option identity, and duplication retaining zero independent stock (Initial quantities in the listing editor).
- [x] 2.3 Reuse stock adjustment locking/revisions/idempotency and return authoritative counts for in-place clients; test concurrent checkout, held-count rejection, lost response replay, off-site removal/set, and separate refund/restock behavior (Inline audited stock changes; Stock action recovery across workspaces; Preserve commerce stock lifecycle during listing management).
- [x] 2.4 Return all publication blockers with field targets and validate intended details/gallery changes atomically; test invalid published edits retain previous content, zero-stock publication remains valid, and forbidden/unauthenticated/cross-origin actions do not mutate data; document save/publish contracts (Clear publication and save feedback).

## 3. Photo lifecycle and shared-file safety

- [x] 3.1 Implement effective generated alt resolution and custom override/reset across upload, editor, public catalog, image output, and duplication; test blank/default/custom/rename/variant behavior and verify nonempty screen-reader output without fabricated descriptions; update optional-alt guidance (Automatic editable photo descriptions).
- [x] 3.2 Make successfully verified new uploads visible for drafts and published products, add explicit hide/show, and unify eligibility/cover selection; test last-photo protection, hidden-cover ordering, placeholder rejection, association ownership, concurrent 12-photo/budget limits, and same-intent concurrent finalize (Explicit usable gallery visibility).
- [x] 3.3 Replace direct shared-object deletion with reference removal and durable cleanup; test source/duplicate deletion in both orders, duplication versus cleanup race, provider outage/partial deletion retries, abandoned upload cleanup, and truthful unique-byte accounting; document maintenance behavior without adding a scheduler (Guarded permanent removal and media cleanup).
- [x] 3.4 Add reviewed legacy-hidden photo recovery with preview and selected show actions; test that verification/limits apply and migration does not blanket-publish retained photos; correct the current operator guide's unsupported unhide claim (Explicit usable gallery visibility).

## 4. Recoverable complete editor

- [x] 4.1 Introduce typed editor/base/draft state and serialized local product/gallery mutations; test that replies do not overwrite edits typed during requests and that only confirmed submitted values clear; include structured variant, photo, and stock state (Independent actions preserve working edits).
- [x] 4.2 Implement versioned same-tab recovery, safe storage failure handling, automatic matching-base restore with discard, and base/local/latest conflict review; Chrome checks must cover reload, internal navigation, auth expiry, stale revision, unnamed controls, file-reselect notice, and no silent newer-data overwrite (Recover editor drafts against current server state).
- [x] 4.3 Combine details, photo selection/previews, initial quantities, price, and advanced option controls on the new-listing screen; save without reload, adopt canonical identity, then upload selected files; verify fixed-piece and two-option workflows retain all controls, stable IDs, and no unwanted implicit save (Complete listing workspace; Initial quantities in the listing editor).
- [x] 4.4 Build per-file progress/results/retry and in-place gallery controls for order, cover, alt, association, hide/show, and delete; test mixed upload success, unsupported HEIC guidance, lost finalize response, focus preservation, and pending product/gallery edits across every photo action (Explicit usable gallery visibility; Independent actions preserve working edits).
- [x] 4.5 Extract shared stock controls for editor and Inventory with presets/custom reasons, preview, history, and per-row pending state; Chrome checks must prove one row's success leaves other rows and dirty listing fields intact and that corrections still respect holds (Inline audited stock changes; Stock action recovery across workspaces).
- [x] 4.6 Add saved/unsaved/failed/uncertain feedback, scope-specific action labels, publication checklist links, and accessible mobile/keyboard focus and live announcements; verify no routine successful action reloads the editor and publish waits for uploads; update design-system and operator workflow documentation (Clear publication and save feedback; Complete listing workspace).

- [x] 4.7 Replace separate product/draft/photo-save buttons with one Create listing / Save changes action; coordinate new draft creation, queued uploads and requested visibility, reconcile retries and old photo-save receipts, preserve later edits, and verify combined gallery/detail saves, draft fallback, failed uploads, keyboard submission and one-click publication in Chrome; update operator/design guidance and verify protected preview with sales/newsletter disabled.

- [x] 4.8 Keep the desktop right-side save panel visible through details, photos, stock and listing actions, including short viewports; verify actual Chrome scroll positions and screenshots, mobile flow, existing form workflows and the protected preview release.

## 5. Listing deletion and retained commerce

- [x] 5.1 Add confirmed Delete listing, Trash/filter, Restore-as-draft, separate archive/unpublish, and pending-work save/discard/cancel handling; test normal list/inventory/public detail/quote/checkout exclusions and reserved slug restoration (Recoverable listing deletion).
- [x] 5.2 Implement permanent-deletion eligibility and confirmation for unused never-published trashed drafts only; test stock/movement/order/reservation/upload blockers, transaction races, foreign keys, surviving audits, referenced media preservation, and cleanup retries; document Delete versus Archive and retained-history explanations (Guarded permanent removal and media cleanup).
- [x] 5.3 Run adversarial commerce integration for deletion with an open reserved session, delayed paid event, duplicate/old events, uncertain creation, expiration, fulfillment, refund, and eligible restock; verify immutable snapshots, exactly-once movements, continued recovery, and no new checkouts (Preserve commerce stock lifecycle during listing management).

## 6. Integrated acceptance and release evidence

- [x] 6.1 Reconcile overlapping capability requirements with `launch-physical-merchandise`, including manual-alt and staged-photo language, while preserving every existing feature and unchecked launch gate; verify coherent combined requirements and `openspec validate simplify-inventory-workflow --strict --no-interactive`, then publish the coherent artifact batch through the repository sync command.
- [x] 6.2 Run `npm test`, `npm run check`, `npm run build:local`, and `npm run test:browser` in the required sequence against only isolated `_test` data, followed by the configured production adapter build; record results and verify the regression matrix covers fixed/option listings, failed actions, retained drafts, deletion, shared media, exports, and security.
- [x] 6.3 After separately authorized schema release/preview deployment, verify actual Garage upload/processing, published-photo visibility within five seconds, legacy review, delete/restore, copied-image safety, cleanup recovery, and held-payment settlement; record environment/revision/results in launch evidence and verify sales/newsletter gates remain disabled.
- [ ] 6.4 Observe independent primary-operator desktop/mobile/keyboard acceptance: fixed listing with three photos/stock within five minutes excluding transfer, two-option listing within ten, edit within two, stock change within one; record timings and resolve failures before marking acceptance complete.

- [ ] 6.5 After Justin’s explicit production deployment authorization, restore-check the encrypted production database/media/config checkpoint, rehearse the inventory migration on its isolated copy, preserve original business/auth signatures, migrate with the dedicated identity and runtime grants, stage a deletion-aware rollback baseline, run the routine deploy from reviewed main, and verify production inventory assets/media/public routes with sales/newsletter disabled.

## Workflow follow-up

- Review the completed plan before requesting implementation; planning itself does not authorize application edits or deployment.
- Sync delta specs and archive only when implementation and required evidence are complete and the overlapping launch change is reconciled; retain unrelated launch gates and production migration approval boundaries.

## Verification record

Local and approved preview evidence: `docs/inventory-workflow-validation.md` (94 domain/integration and 18 Chrome tests; both builds, migration fixtures and strict OpenSpec checks passed). Task 6.3 passed on protected preview revision `4cf0ad0`, including actual Garage cleanup recovery and real Stripe Sandbox settlement after Trash. Task 6.4 remains unchecked for independent primary-operator timings. Production image/schema/data are unchanged; sales and newsletter gates remain disabled.

Single-save refinement 4.7: revision `19626e4` is deployed on protected preview; local Chrome verifies one-click publication, unified gallery/detail saves and recovery, while live server/asset identity, disabled gates and unchanged operator authentication were verified. Independent operator acceptance 6.4 remains open.

Sticky-panel refinement 4.8: revision `8ed3a03` is deployed on protected preview. Twenty measured desktop scroll positions (including short screens and internal panel scrolling), mobile flow/form ownership, all 18 existing Chrome workflows, both builds, and matching live CSS/server template passed. Independent operator acceptance 6.4 remains open.
