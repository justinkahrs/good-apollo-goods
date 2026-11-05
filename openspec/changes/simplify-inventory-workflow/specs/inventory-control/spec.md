# Inventory control delta

## Purpose

Keep physical stock trustworthy while making initial counts and routine adjustments available where listings are edited.

## ADDED Requirements

### Requirement: Initial quantities in the listing editor
New listings SHALL accept an optional nonnegative integer initial quantity for each variant, defaulting to zero. Initial counts SHALL be recorded once as auditable stock movements tied to the saved variant identities. Draft saving SHALL not require completed photos or a nonzero quantity.

#### Scenario: Save a new fixed piece with stock
- **WHEN** an operator saves a new piece with an initial quantity of four
- **THEN** one variant has four unsold, zero held, and four available, with one attributed initial-stock movement and no visit to Inventory

#### Scenario: Retry or invalid initial count
- **WHEN** the creation response is lost and retried, or a submitted initial quantity is invalid
- **THEN** retries recover the same listing and movement, while invalid input commits neither a partial listing nor a partial stock change

### Requirement: Inline audited stock changes
Existing listings SHALL expose per-variant available, held, and unsold counts with add, remove, and set-count controls, a resulting balance preview, reasons, and history links. Common reason presets SHALL satisfy routine entry while custom reasons remain available. Inventory SHALL retain equivalent cross-product controls and filters.

#### Scenario: Receive a new batch
- **WHEN** an operator selects Add stock, enters three pieces, and uses the New batch reason in the listing editor
- **THEN** the confirmed balances update in place, the movement is audited, and unsaved description/photo edits remain unchanged

#### Scenario: Competing correction and hold
- **WHEN** checkout reserves stock while an operator submits a stale correction or attempts to set unsold below held
- **THEN** the server rejects unsafe or stale input, refreshes the authoritative counts for review, retains the requested adjustment, and protects all holds

### Requirement: Stock action recovery across workspaces
Stock actions SHALL have stable retry identities and current server revisions in both editor and Inventory views. Lost responses SHALL be reconciled before accepting a different pending operation. Successful actions SHALL clear only their own confirmed inputs and recovery state.

#### Scenario: Lost adjustment response
- **WHEN** an adjustment commits but its response is lost and the operator retries from restored entries
- **THEN** exactly one movement is recorded and the current balance is displayed without repeating the quantity change

#### Scenario: Change one row among several
- **WHEN** an operator submits one variant's adjustment while another variant has unsaved entries
- **THEN** only the submitted operation clears on success and the other entries stay available without manual restoration

### Requirement: Preserve commerce stock lifecycle during listing management
Listing edits and deletion SHALL preserve existing reservations and original checkout terms. Payment SHALL consume stock once; fulfillment SHALL not consume it again; refunds SHALL not automatically restock. Unknown provider outcomes SHALL retain holds until definitively reconciled, including for deleted listings.

#### Scenario: Payment after listing deletion
- **WHEN** an existing valid reserved session is paid after its listing moves to Trash
- **THEN** the order's original terms and one stock consumption remain valid and fulfillment is available while new checkouts are denied

#### Scenario: Refund of a removed listing
- **WHEN** a paid order for a deleted listing is refunded and physical goods are later returned
- **THEN** refund and explicit eligible restocking remain separate audited actions and retained stock history remains readable
