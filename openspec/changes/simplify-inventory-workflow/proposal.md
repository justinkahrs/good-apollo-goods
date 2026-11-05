# Proposal

## Why

Routine listing work currently spans separate product, photo, and inventory forms whose reloads interrupt edits. Published uploads become hidden without a recovery control, manually entered alt text blocks publishing, and unwanted listings cannot be deleted, making basic store operation unnecessarily difficult.

## What Changes

- Provide one listing editor for details, price/options, photos, initial quantities, later stock adjustments, and publishing. Keep the cross-product Inventory workspace, history, exports, and advanced controls.
- Preserve unsaved work across photo actions, stock changes, validation, connection loss, authentication, and revision conflicts; use explicit save feedback and no routine full-page reloads.
- Make verified uploads visible by default, generate editable product-based alt text, expose intentional photo hide/show, and offer a reviewed repair for existing hidden uploads.
- Add a clearly separated Delete listing action with confirmation, recoverable trash, restore, and safe permanent removal of eligible unused drafts. Retain order, reservation, stock, and audit identities whenever referenced.
- Use one Create listing / Save changes button for details and photos, with Visibility choosing Draft, Published or Archived and uploads coordinated before publication.
- Show a concrete publication checklist and truthful listing/photo/stock states rather than unexplained hidden states or trial-and-error saves.

## Capabilities

### New Capabilities

- `store-administration`: One recoverable listing workspace and predictable save/conflict feedback.
- `merchandise-catalog`: Accessible automatic photo descriptions, explicit gallery visibility, and recoverable listing deletion.
- `inventory-control`: Initial quantities and audited stock adjustments inside the listing editor.

These are existing capability names in the unarchived `launch-physical-merchandise` change, but `openspec list --specs --json` reports no main specs. This change therefore adds distinct requirements under the same capability paths, rather than inventing duplicate capability names or using MODIFIED against absent main requirements. Consolidate the two changes' requirements before syncing/archiving; retain all prior safeguards and unchecked launch gates.

### Modified Capabilities

None in the current main-spec inventory.

## Impact

Targets: `src/pages/admin/index.astro`, `src/pages/admin/products/[id].astro`, `src/pages/admin/inventory.astro`, `src/client/product-editor.ts`, `src/client/admin.ts`, editor styles/components, `src/pages/api/admin/action.ts`, `src/server/catalog.ts`, `src/server/photos.ts`, `src/server/stock.ts`, Prisma schema/migrations, domain/integration/browser tests, and operator/release documentation. Media lifecycle work must account for shared files created by duplication. No commerce platform migration or new paid provider is required.

### Scope, assumptions, and non-goals

Planning is based on the source and existing test definitions at `c1197bdeb92027dd096f62dfd6a64f748a01a206`, after a successful fast-forward pull reported up to date. This audit did not reproduce behavior in an authenticated live browser or inspect production records; code-proven causes and remaining runtime acceptance are distinguished in design.md.

Default decisions: deletion means recoverable removal from normal working views; permanent deletion is an explicitly confirmed secondary action for unused records only. Automatic alt text names the product and optional known variant, without inventing visual details. Unsaved changes are never silently published. These choices remain reviewable in this plan.

No checkout/payment/refund/fulfillment redesign, live sales/newsletter activation, production data edits, infrastructure work, or implementation/deployment is part of this planning request. Preserve brand, URLs, accessibility, options/SKUs, stock protections, audit/export, and existing commerce recovery.

### Measurable success

- A single-piece listing with price, initial stock, and three photos can be created and published from one editor without visiting Inventory or typing alt text; target independent operator completion within five minutes after sign-in, excluding file transfer time.
- A two-option listing retains the existing ten-minute acceptance target; a routine edit takes at most two minutes and a stock adjustment at most one minute.
- Every supported upload has visible per-file success/failure state; verified additions to a published listing appear within five seconds of commit on a fresh public request.
- Regression coverage proves zero lost non-file edits during supported editor actions, and retries cannot duplicate creation, uploads, or stock movements.
- Delete/restore and eligible permanent deletion succeed without altering immutable orders, holds, or stock history; copied listings keep working photos after source deletion.
