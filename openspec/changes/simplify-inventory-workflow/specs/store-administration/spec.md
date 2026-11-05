# Store administration delta

## Purpose

Let the operator finish listing work in one accessible workspace with predictable saves and recoverable edits.

## ADDED Requirements

### Requirement: Complete listing workspace
The admin SHALL support details, prices, options, photos, initial quantities, stock adjustments, and publication in one listing editor. Products, Inventory, Orders, history, exports, duplication, advanced settings, and keyboard/mobile controls SHALL remain available.

#### Scenario: Create one piece in one place
- **WHEN** an operator creates a fixed piece with a price, quantity, and three photos
- **THEN** the operator can save and publish without visiting another admin section or entering alt text, with one default variant and generated SKU

#### Scenario: Manage options without losing controls
- **WHEN** an operator creates two named options or edits an existing variant
- **THEN** per-variant price, identity, stock, SKU, thresholds, activation, generation, and photo association remain available without replacing existing stock identities

### Requirement: Independent actions preserve working edits
Photo uploads, ordering, visibility, deletion, and stock actions SHALL preserve unrelated entered content, validation state, focus, and editor context. Each action SHALL state what was committed. Unsaved product content SHALL not be published by a photo or stock action.

#### Scenario: Upload while editing
- **WHEN** an operator edits a description and variant price, then uploads or deletes a photo
- **THEN** both edits remain entered and unsaved, and only the requested photo action is committed

#### Scenario: Save details with pending photo work
- **WHEN** an operator saves details while photo order or alt-text edits are pending
- **THEN** the same listing save commits both details and staged photo edits, while edits made after submission remain entered and unsaved

### Requirement: Recover editor drafts against current server state
The editor SHALL retain non-file edits after validation failure, network failure, reload, navigation, or reauthentication in the same tab. Recovery SHALL compare against the current server revision and show conflicts without silently overwriting newer data. Unrecoverable file selections SHALL receive an explicit reselect prompt.

#### Scenario: Recover after reload
- **WHEN** an operator reloads with unsaved details, variant rows, photo ordering, visibility, or stock entries
- **THEN** recoverable entries are restored with a visible notice and discard choice, while current server identities and revisions remain authoritative

#### Scenario: Concurrent save
- **WHEN** another tab changes a field also edited locally
- **THEN** the editor shows the local and latest saved values, retains local work, and requires review before resubmitting

#### Scenario: Session expiry or unavailable storage
- **WHEN** saving requires reauthentication or browser draft storage is unavailable
- **THEN** the editor keeps in-memory edits, explains the required action or recovery limitation, and never reports an uncommitted save as successful

### Requirement: Clear publication and save feedback
The editor SHALL show saved, unsaved, saving, failed, and uncertain outcomes; list all publication blockers with links to their controls; and keep draft saving available when publication is incomplete. Repeated or uncertain submissions SHALL reconcile before creating duplicate records or side effects.

#### Scenario: Incomplete publication
- **WHEN** a draft lacks a usable photo and sufficient description
- **THEN** both blockers appear together, draft work remains saveable, and no invalid public listing replaces saved content

#### Scenario: Lost creation response
- **WHEN** a new listing save commits but its response is lost and the operator retries
- **THEN** the existing created identity is recovered instead of creating a second listing

#### Scenario: Keyboard and phone completion
- **WHEN** an operator completes listing, photo, stock, delete, and recovery actions on a phone or by keyboard
- **THEN** labels, focus, status announcements, error links, and confirmations remain readable and operable

### Requirement: One listing save control
The editor SHALL offer one primary save button, labeled Create listing for a new identity and Save changes afterward. Visibility SHALL choose Draft, Published or Archived without separate draft/product/photo-save controls. The same action SHALL save submitted details, variants and staged gallery metadata, wait for selected uploads before publishing, reconcile retries, and retain later keystrokes as unsaved.

#### Scenario: Create and publish with selected photos
- **WHEN** an operator selects photos, enters initial stock, chooses Published and clicks Create listing once
- **THEN** the editor creates the private identity and stock once, processes the photos and publishes only after validation without requiring another save button

#### Scenario: Interrupted creation or publication
- **WHEN** uploading fails or publication is invalid after private creation
- **THEN** the confirmed draft remains recoverable, the requested publication is not reported successful, and the same save control can retry without duplicate listings or initial stock

#### Scenario: Unified editing and draft saving
- **WHEN** an operator changes details, photo descriptions/order/visibility and listing Visibility
- **THEN** Save changes commits the submitted changes together, including saving privately when Draft is selected, and reports any incomplete files or later unsaved edits clearly
