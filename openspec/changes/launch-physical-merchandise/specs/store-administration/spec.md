# Store administration

## Purpose

Give the primary operator a secure, approachable place to manage merchandise and orders independently, with understandable validation, recoverable edits, and traceable business actions.

## ADDED Requirements

### Requirement: Independently secured operator access

The system SHALL restrict administration to explicitly authorized store operators, require verified sign-in and a current-session second-factor verification lasting no more than eight hours, and enforce both checks on every protected page, mutation, upload, packing slip, and export. Authentication/enrollment screens SHALL expose no business data before verification. Session revocation SHALL remove access. Public signup SHALL never grant admin rights.

#### Scenario: Attempt direct mutation without admin verification

- **WHEN** an anonymous user, non-admin account, or expired second-factor session directly requests a stock/product/refund operation
- **THEN** the operation is denied and business data/state are unchanged

#### Scenario: Sign in for a work session

- **WHEN** an allowlisted operator signs in and completes second-factor verification
- **THEN** ordinary product, stock, and order work proceeds without repeated second-factor prompts while the verification remains valid

#### Scenario: Add a temporary testing operator

- **WHEN** the owner adds an explicit extra email to the configured operator allowlist and runs bootstrap
- **THEN** bootstrap idempotently establishes both the primary and extra operator accounts, either can receive an email sign-in link, and each still requires verified email and current-session second-factor verification

#### Scenario: Remove a temporary operator

- **WHEN** an extra operator is removed from the allowlist and the updated configuration is loaded
- **THEN** protected access is denied even if that account retains an admin role and previously verified session

#### Scenario: Revoke access

- **WHEN** an operator's session or admin access is revoked
- **THEN** subsequent admin reads and mutations fail even if a previous admin page remains open

### Requirement: Safe input and request boundaries

The system SHALL validate every admin input, protect mutations against cross-site requests, restrict redirects/uploads/tracking links to allowed targets, and limit sign-in/upload/checkout abuse across application instances. Secrets, authorization tokens, private upload URLs, and customer addresses SHALL not appear in logs or public errors.

#### Scenario: Cross-site stock mutation

- **WHEN** a third-party origin submits a state-changing request using an operator's browser session
- **THEN** it is rejected without changing inventory

#### Scenario: Repeated or unsafe upload intent

- **WHEN** an upload request exceeds limits, targets another product without ownership, or specifies a disallowed type/key
- **THEN** no usable upload authorization or published image is created

### Requirement: Simple daily merchandise workflows

The admin SHALL present Products, Inventory, and Orders as the main workflows, use dollar prices and plain stock labels, hide provider/internal identifiers from routine forms, and provide visible save/upload feedback. Forms SHALL have accessible labels, keyboard controls, touch-friendly layouts, and recoverable validation/unsaved state.

#### Scenario: Primary operator creates a listing

- **WHEN** the primary operator completes a brief walkthrough and creates a product with two options, prices, stock, and three photos
- **THEN** the operator can publish it independently within ten minutes without source edits, command-line tools, or deployments

#### Scenario: Create one fixed piece without variant clutter

- **WHEN** an operator adds a single fixed-size hat with one exterior/lining combination
- **THEN** the main form presents name, description, size/details and one dollar price, creates one default stock identity, and keeps variant generation and secondary product settings behind optional sections

#### Scenario: Edit an optionless piece without changing inventory identity

- **WHEN** an operator edits its price or restores unsaved single-item entries
- **THEN** its existing variant identity and stock are preserved, SKU overrides and stock alerts remain available, and the shopper does not have to choose an artificial size

#### Scenario: Consistent daily studio presentation

- **WHEN** an operator moves among Products, Inventory, Orders and Settings on desktop or phone
- **THEN** the pages share the branded open workspace, covers/counts/statuses and useful empty states; inventory adjustments and exceptional order actions remain available in disclosures, and missing tax verification remains visible

#### Scenario: Daily edits and shipping tasks

- **WHEN** the operator edits a description/photo, records stock, or packs a test order
- **THEN** the edit completes within two minutes and each stock/packing task within five minutes using the documented admin workflow

#### Scenario: Mobile and keyboard operation

- **WHEN** the operator completes core workflows on a phone or using only a keyboard
- **THEN** fields, variant rows, photo ordering, stock actions, and order controls remain readable, reachable, and operable

### Requirement: Conflict-safe recoverable saves

The system SHALL reject stale edits that would overwrite a newer committed revision and explain how to refresh/reapply them. Validation, network failure, or session expiry SHALL retain entered content where possible and SHALL never falsely report success.

#### Scenario: Two tabs edit one product

- **WHEN** one tab saves a new description and an older tab then saves its old product revision
- **THEN** the older save receives a conflict and does not overwrite the committed description

#### Scenario: Authentication expires during editing

- **WHEN** the operator's verification expires with an unsaved product form
- **THEN** saving requests reauthentication and retains recoverable form content without performing an unauthorized write

### Requirement: Audits and useful exports

The system SHALL retain actor/time/entity/action records for catalog, stock, shipment, refund, settings, and access changes. Authorized operators SHALL export current catalog/variant stock and order data without exporting credentials or exposing records to public users. Spreadsheet-compatible exports SHALL prevent cells from becoming executable formulas.

#### Scenario: Trace a stock or refund action

- **WHEN** an operator reviews a prior stock correction or refund request
- **THEN** its actor, reason/action, affected record, and time are available without revealing secret credentials

#### Scenario: Export safe business records

- **WHEN** an authorized operator exports records containing formula-like product/customer text
- **THEN** the file preserves usable business values without executing formulas when opened in spreadsheet software
