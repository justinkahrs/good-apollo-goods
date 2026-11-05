# Design

## Context

See proposal.md for motivation and measurable outcomes. Audit scope is the pulled source at `c1197bdeb92027dd096f62dfd6a64f748a01a206`, related schemas, migrations, operator docs, and test definitions. No authenticated browser run or production data inspection was performed for this plan. Runtime reproduction and independent operator acceptance remain explicit implementation tasks.

### End-to-end workflow audit

| Stage | Observed implementation | Friction or defect | Planned result |
| --- | --- | --- | --- |
| Find a listing | `src/pages/admin/index.astro` offers name/status filters, covers, counts, edit/view, catalog export; All includes archives | No delete action, Trash, or direct stock action | Preserve search/status/export; add Trash and confirmed deletion; edit opens the complete workspace |
| Create a fixed piece | `src/pages/admin/products/[id].astro` uses a generated default variant; optional settings hide variants, metadata, tax, duplication | Photos do not exist until first save; starting stock is unavailable | Choose photos and initial quantity immediately; Create listing coordinates the private identity, uploads and selected visibility |
| Create options | `src/client/product-editor.ts` generates combinations; server matches identities and deactivates omissions | Generation replaces rows; no summary of omitted choices before save | Preserve matching stock identities, review removed choices, keep all advanced controls |
| Save details | Product save redirects to the same editor | Pending photo edits require separate recovery; focus/context reset | Apply authoritative response in place and retain other dirty sections |
| Add photos | Client uploads sequentially, then reloads; a failure stops the loop and clears the file input | Completed files before failure can be hard to distinguish; pending photo edits interrupted | Per-file queue, in-place insertion, explicit retry and reconciliation |
| Published uploads | `src/server/photos.ts:finalizePhoto` sets `archivedAt` for every published-product upload | Client renders Hidden from shop; neither `savePhotos` nor client controls clear it | Verified new images default visible; explicit hide/show and legacy review |
| Alt text and publish | New images default to empty alt; catalog/photo validation rejects blank published alt | Operator must manually describe every image to publish; hidden images remain hidden even after description | Product-based generated defaults, custom override, complete publication checklist |
| Photo save/delete | Separate form uses the product revision, then reloads; deletion clears photo recovery state | Product and gallery actions contend for one revision; deletion explicitly warns unsaved photo changes will be lost | Serialize local operations, refresh revisions, remove only affected state |
| Add or correct stock | `/admin/inventory/` has preview, reasons, balances, history; successful adjustment reloads the whole page | Leave listing editor; other rows' pending entries interrupted | Shared inline stock component on both routes; update one balance in place |
| Recover work | `src/client/admin.ts:recoverForm` stores named fields and offers manual restore in sessionStorage | Several editor controls are unnamed; hidden JSON provides partial coverage, file inputs are unrecoverable; recovery can restore an old revision | Versioned draft document including structured editor state; server revisions excluded from blind recovery |
| Publish and view | Server checks description, active positive price, real verified cover/alt; stock may be zero; fresh requests query DB | Blockers returned one at a time; shop status is distinct from actual stock and global launch gate | Checklist shows all blockers; distinguish published/sold-out/sales-disabled states |
| Retire or delete | Status supports draft/published/archived; action API has no product deletion | Archive is the only retention mechanism and remains in All | Explicit Trash lifecycle plus guarded permanent removal |
| Duplicate and media | `catalog.ts:duplicateProduct` copies image keys and derivatives, not file bytes; `photos.ts:deletePhoto` deletes those objects directly inside a DB transaction | Deleting a photo can break another listing; provider deletion cannot roll back with DB changes | Shared asset references and durable post-commit unreferenced cleanup |
| Orders and recovery | `stock.ts` locks balances, deduplicates movements, protects held stock; schema and SQL protect history | Any destructive product shortcut could undermine those guarantees | Keep identities for history/holds, make deletion a purchase gate, keep existing settlement and order tools |

Existing `tests/browser/store.spec.ts` uses Chrome and `saveAndReload`, covers manual restore, staged photos, and separate Inventory navigation. Those tests exercise the current workflow; their existence is not evidence the reported interruptions are acceptable. `tests/commerce.test.ts` covers concurrency/retries and retained images but needs explicit published-upload visibility, deletion, shared-object, and cross-section dirty-state regressions. `docs/store-operator-guide.md` claims hidden photos can be included in a valid save, whereas `savePhotos` preserves `archivedAt`; documentation and implementation disagree.

The OpenSpec config contains historical Vercel and task-count statements. Current repository guidance and deployment records select the Senna standalone Node VPS. This plan targets that runtime and leaves launch gates open. No config or existing launch artifacts are changed during planning.

## Goals / Non-Goals

**Goals:** Satisfy the three capability deltas with explicit local versus committed state, stable server identities, composable stock controls, and recoverable lifecycle operations. Use the existing Astro/TypeScript app and brand.

**Non-Goals:** Replace the framework, introduce a general rich-text editor, redesign order management, change provider routing, enable commerce/newsletter delivery, or infer production content changes from this audit.

## Decisions

### 1. One editor, explicit persistence boundaries

Keep `/admin/` and `/admin/products/:id/`, plus the cross-product `/admin/inventory/` route. Present details, Photos, Price & stock, and optional Options/settings together. Existing Inventory remains valuable for batch counts, filters, exports, discrepancies, and uncertain holds.

The desktop price/publishing panel remains sticky across the entire details/photo/stock/lifecycle workspace, with the save control first and panel overflow bounded to the viewport so short screens keep it reachable. Preserve normal single-column flow on phones.

Use exactly one primary listing save control: **Create listing** before the first confirmed creation, **Save changes** for an existing identity, and **Saving…** while the operation runs. Visibility selects Draft, Published or Archived; there are no separate product, draft or photo-save buttons. The save commits details, variants and staged gallery edits together. Keep independently audited stock changes, file retry and confirmed photo deletion available.

For a new listing, allow file selection/previews and initial per-variant quantities before saving. One click creates a private draft with stable stock identities, uploads the selected files, then applies the requested publication/archive state. A failed transfer or invalid publication retains the confirmed private draft and shows the remaining work. Never claim the requested publication succeeded after only draft creation. Existing publication changes wait for selected uploads and validate the complete intended gallery server-side. Retrying the same save reconciles earlier receipts before further work, without duplicate listings or initial movements.

The save snapshots submitted details and gallery edits before asynchronous work. Edits typed during requests/uploads remain entered and unsaved; later stages must not silently publish those newer values. Draft remains available through the same Visibility selector and save control. Failed files show per-file retry/removal and an honest partial-save message. Upload finalization and confirmed photo deletion preserve unrelated dirty details. Pending legacy photo-save receipts are reconciled for compatibility with tabs opened before this refinement.

Rejected alternatives: one enormous transaction including uploads/provider calls is not atomic across services; automatic saving of all fields on each photo action would unexpectedly publish incomplete product edits. Keeping separate reload-based forms would preserve the core friction.

### 2. Structured draft state and reconciled mutations

Replace ad hoc named-control serialization in the product editor with a typed, versioned state document: base server snapshot/revision, dirty field values, stable client row IDs, options, gallery IDs/order/visibility/custom descriptions, and pending per-variant stock entries. Keep files in memory only. Autosave recovery state in sessionStorage in the same tab; catch storage exceptions and retain in-memory operation. Restore matching-base drafts automatically with a notice/discard control; when the server changed, three-way compare base/local/latest and ask only about conflicting values. Never restore hidden revision inputs as authority.

Persist stable operation IDs for creation, combined saves, lifecycle actions, uploads/finalization, and stock adjustments; bind them to actor/entity/payload and return canonical result on replay. Do not reset identity merely on transport errors. Reconcile a lost response before accepting a contradictory operation. Local product/gallery operations share one serialized queue; stock uses its own balance revision. Responses return current product/gallery/stock IDs, revisions, and mutation receipts. Merge updates into the base snapshot without replacing newer local keystrokes entered while a request was pending. Clear only fields whose submitted values are confirmed; do not clear unrelated draft state. Deletion explicitly handles pending work with save/discard/cancel choices.

Keep origin/auth/step-up checks on every action. A 409 returns current safe entity data and actionable conflict details. Reauthentication opens the existing protected flow while retaining edits. Warn on navigation only while unrecoverable files or pending operations would be lost; ordinary draft recovery must work across internal navigation and reloads. Keep focus, open disclosures, scroll, and live status announcements on in-place updates. Do not build a site-wide reactive framework solely for this editor.

### 3. Photo descriptions, visibility, and upload queue

Keep JPEG/PNG/WebP, 10 MB, 12 visible photos, pixel limits, private originals, sanitized upright WebP derivatives, budgets, and variant associations. Preserve accessible move-up/down and cover controls; drag gestures can supplement them but are not required.

Represent alt source explicitly as generated/custom. Effective generated text uses saved product name plus a known associated variant label if applicable; do not claim colors, poses, or materials from filenames. Display the actual generated value in an optional description editor; blank custom input resets to generated mode. Resolve default text consistently on admin, public gallery, media output, and duplication. Backfill blank legacy descriptions as generated; preserve existing nonempty text as custom. Renaming updates generated text only. Runtime rendering must always emit a nonempty effective description for visible product images.

New finalization sets a verified image visible independent of product publication state and appends after the current highest visible position, not merely visible count. It returns the image and new revision without reload. Failures remain queue entries with their own status/retry; continue other valid files. Reconcile intent IDs when finalize response is uncertain, including concurrent/repeated finalize, and clean losing derivative objects safely. File progress, verified success, and failed retry are different states. File limits and storage budgets must be enforced atomically under concurrent uploads. Existing visible gallery remains intact on failure.

Keep `archivedAt` as the current explicit hiding mechanism; add hide/show controls to the editor API and record future intent in audit metadata. Initial UI and public catalog must use one eligibility/cover calculation: not hidden, verified, non-placeholder, derivatives present, effective alt nonempty. Hiding/deleting the last visible published image requires a valid replacement in the same save or an explicit transition to draft. Do not blanket-unhide legacy records: their reason is not reliably recoverable. Add a legacy-hidden review notice with previews, per-image show, and a confirmed selected-image recovery action within gallery limits.

### 4. Inline stock without a second inventory system

Extract existing adjustment UI into a shared component used by editor and Inventory. Keep add/remove/set, balance preview, reason, history, thresholds, and all advanced controls. Presets such as Initial stock, New batch, In-person sale, Consignment, Damage, and Count correction reduce typing; custom reasons remain available. Never infer returned physical inventory from a refund.

Initial quantities belong to newly created variants only and commit with product creation through the existing movement/lock helpers and a stable operation identity per variant. Existing quantity edits use `adjustStock`, not raw assignments in product save. Adding an option to an existing product creates its stock identity at zero, then records an explicitly entered initial count once. Removing a variant deactivates it and previews affected choices; held and historical stock identities stay. Persist entries for other rows when one adjustment succeeds. Keep server stock revisions separate from product revision.

### 5. Delete means remove from daily work with recoverable history

Add nullable `deletedAt` (and deletion actor metadata/audit) on Product, independent of draft/published/archived. **Delete listing** confirms product name and effect, sets deletedAt, and removes the listing from normal views, public catalog/details, and new quote/checkout eligibility. Trash is an explicit filter with Restore; restore clears deletion and sets status=draft. URLs remain reserved while retained. Archive/unpublish remain available and semantically distinct.

Serialize product save, delete/restore, checkout eligibility/reservation creation, upload intent/finalize, and permanent eligibility checks using a shared product-lock order before stock locks. Stale editor saves cannot clear deletion. Requests after deletion fail plainly; a checkout that committed before deletion retains its reserved terms. Finish existing paid processing, unknown-session reconciliation, expiration, packing, refund, and restock against retained identities. Payment consumes once; shipment never consumes again; refund alone never returns physical stock.

**Delete permanently** is a separate action in Trash, available only to never-published unused drafts with zero stock, no movements, no order items or reservations (including expired/historical), and no active uploads. Recheck all conditions under locks; do not weaken foreign keys or append-only movement triggers. Explain blockers inline. Retain audit tombstones with minimal product identity. There is no automatic expiry/purge of Trash in this change.

### 6. Reference-aware cleanup outside catalog transactions

Current duplicated ProductImage rows share original/derivative keys. Introduce a normalized shared media-asset record and listing-image references, backfilled by canonical object-key identity. A shared asset owns originals/derivatives and byte accounting; hiding or trashing does not remove its reference. Deduplication is based on existing shared keys, not a new content-addressed upload feature.

Deleting a photo or permanently eligible listing commits reference removal plus a durable cleanup job. The existing maintenance path claims an asset only if neither listing images nor immutable order image keys reference it, marks it deleting atomically, and deletes objects outside the catalog transaction. Duplication must acquire a live asset reference under the same lifecycle lock, never attach to a deleting asset. Failed/partial storage cleanup retries from the job; missing objects count as cleaned. Keep asset byte accounting until object cleanup succeeds, charge shared bytes once, and use immutable object keys. Include abandoned uploads and failed finalizations in bounded cleanup. No new scheduler or provider is needed; document use of the existing maintenance lifecycle and its prelaunch deployment gates.

### 7. Reuse existing custom admin

Retain Good Apollo's server-side price/publication authority, `stock.ts`, audit, auth, and private upload processing. Read-only Vesper references inspected: `src/components/admin-catalog-panel.tsx` demonstrates local UI updates and scoped busy feedback; `src/lib/admin-catalog.ts` checks publication issues before an audited transaction. Adapt those patterns, not Vesper's form reset behavior, React component, digital releases, direct upload routing, or download entitlements. The physical stock and shared-media guarantees belong in this repository.

A hosted commerce migration would replace independently scoped orders/auth/media and require provider/data migration plus brand integration. It does not directly fix this editor's state-loss defects within the requested scope. Improve the existing custom admin using current dependencies. No externally asserted provider/API constraints are introduced here; observed constraints come from inspected project code. Verify current primary provider documentation during implementation if any integration boundary changes.

## Risks / Trade-offs

- [Default descriptions are less specific than hand-written descriptions] → Keep editing optional and visible, preserve custom text, and validate screen-reader output without fabricated image details.
- [Legacy hiding has ambiguous intent] → Review selected photos; never publish all retained media as a migration side effect.
- [Immediate successful photo additions affect published galleries] → Label the live action clearly; keep unverified failures private and unrelated typed details unsaved.
- [Draft storage is tab-scoped and excludes file bytes] → State recovery limits, persist structured non-file data, retain live file queue, prompt reselect after reload.
- [Shared-media normalization and product locking expand migration scope] → Additive migration, invariant tests, preview concurrency/cleanup failure tests, and separate migration authorization before production rollout.
- [Trash retains media/storage] → Show retained records, keep budgets honest, allow guarded cleanup of unused drafts; do not purge commercial history to free space.
- [Pending launch change overlaps capability paths] → Merge additive requirements deliberately and reconcile old mandatory-manual-alt/staged-photo wording before either change syncs into main specs.

## Migration Plan

1. Reproduce the reported interactions in Chrome on isolated synthetic `_test` data and capture the current failure evidence before implementation. Preserve current owner data and sessions.
2. Add deletion state, media references/cleanup jobs, alt-source metadata, and mutation receipts with backward-compatible defaults; backfill on a disposable copy and verify counts, key references, unique bytes, and no public visibility change. Do not infer intended hidden-photo recovery.
3. Implement the server boundaries and editor changes with feature-compatible reads; run domain/integration, Astro, standalone build, and Chrome tests sequentially where databases are shared. Update operator/design/release docs and reconcile overlapping OpenSpec requirements without checking unrelated launch gates.
4. After authorized schema release and preview deployment, verify real Garage upload, visible published addition, delete/restore, copied-image safety, cleanup retry, preserved edits, held checkout settlement, and disabled launch gates. Obtain timed operator acceptance; record exact revision, environment, timings, and evidence. Runtime and operator tasks stay unchecked until observed.
5. Rollback disables the new editor/mutations while preserving additive data and reconciliation jobs. Do not roll back to code that ignores deletedAt and republishes trashed products; use a compatibility release enforcing deletion filters. Do not drop history or restore an old pre-sale database over accepted orders.
