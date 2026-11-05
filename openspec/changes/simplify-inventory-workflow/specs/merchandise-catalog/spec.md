# Merchandise catalog delta

## Purpose

Make listing and gallery lifecycle actions understandable while preserving accessible images and historical commerce records.

## ADDED Requirements

### Requirement: Automatic editable photo descriptions
The system SHALL provide nonempty product-based alt text when a photo has no custom description. Known variant labels can qualify the default; unsupported visual details SHALL NOT be invented. Custom alt text SHALL remain editable and preserved, and blank input SHALL use the default without blocking publication.

#### Scenario: Publish without manual alt text
- **WHEN** an operator uploads three photos of a named product and publishes without editing photo descriptions
- **THEN** every public photo has nonempty default alt text and no manual alt-text blocker appears

#### Scenario: Preserve custom descriptions
- **WHEN** an operator edits alt text and later renames or duplicates the product
- **THEN** the custom text is retained while generated descriptions use the appropriate product identity

### Requirement: Explicit usable gallery visibility
Verified non-placeholder uploads SHALL become visible gallery entries by default after successful finalization, including for published products. Operators SHALL be able to hide, show, order, associate, and choose a cover. Each entry SHALL distinguish upload/processing failure, explicit hiding, and visibility. Unverified images SHALL never become public.

#### Scenario: Add a photo to a published listing
- **WHEN** a supported photo finishes verification on a published product
- **THEN** it appears in the editor and on a fresh public request within five seconds without a separate unhide or alt-text step, preserving existing gallery order

#### Scenario: Hide or remove the last visible photo
- **WHEN** an operator tries to hide or delete the only valid photo on a published product
- **THEN** the system offers replacement or explicit unpublishing and preserves the previous valid listing until one is committed

#### Scenario: Mixed upload outcomes
- **WHEN** one file in a multi-file selection fails validation, processing, or transfer
- **THEN** successful files remain identifiable, other supported files can complete, only failed files need retry, and unrelated edits remain intact

#### Scenario: Repair legacy hidden uploads
- **WHEN** an operator reviews existing hidden photos
- **THEN** each can be shown with a preview and generated description after verification, without automatically exposing every retained legacy image

### Requirement: Recoverable listing deletion
Operators SHALL be able to delete a listing through a clearly named confirmed action and restore it from Trash. Deleted listings SHALL disappear from normal product/inventory views and new purchase flows while retaining history. Restore SHALL return the listing as a private draft. Archive and unpublish SHALL remain separate available actions.

#### Scenario: Delete a listing with stock or order history
- **WHEN** an operator confirms Delete listing on a product with stock movements, orders, or reservations
- **THEN** the listing moves to Trash, new purchases are denied, and balances, immutable history, existing payment reconciliation, and order fulfillment remain intact

#### Scenario: Restore a listing
- **WHEN** the operator restores a deleted listing
- **THEN** its identity, reserved URL, variants, gallery, and stock are preserved in a private draft requiring explicit publication

#### Scenario: Delete conflicts with another operation
- **WHEN** deletion races with a checkout, upload, or newer editor save
- **THEN** operations serialize or reject visibly so no new purchase starts after deletion and no stale save resurrects the listing

### Requirement: Guarded permanent removal and media cleanup
Permanent deletion SHALL require separate confirmation and server-verified eligibility as an unused never-published draft with zero stock, no movements, no orders/reservations, and no active uploads. Audit records SHALL survive. File cleanup SHALL preserve objects referenced by other listings and SHALL be recoverable after provider failure.

#### Scenario: Remove an unused draft
- **WHEN** an operator permanently deletes an eligible trashed draft
- **THEN** it is removed, an audit record remains, and unreferenced media is queued for safe cleanup

#### Scenario: Retained history blocks permanent deletion
- **WHEN** an operator attempts permanent deletion of a historically referenced or previously published listing
- **THEN** the system explains why history is retained and keeps the listing in Trash without deleting stock or orders

#### Scenario: Copied image and storage failure
- **WHEN** deleting a source photo or eligible listing whose files are shared with a duplicate, or storage cleanup fails
- **THEN** the duplicate keeps usable photos, and failed unreferenced cleanup remains retryable without falsely restoring the deleted listing
