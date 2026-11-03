# Production readiness

## Purpose

Make real merchandise sales operationally supportable through isolated configuration, reliable maintenance, tested recovery, accurate public content, and concrete launch evidence.

## ADDED Requirements

### Requirement: Isolated explicit runtime configuration

Development, preview, and production SHALL use separately scoped, validated database, storage, auth, and payment settings. Production SHALL run standalone Node on the VPS with TLS, isolated Good Apollo PostgreSQL/Garage credentials, authenticated n8n maintenance, and web/disk limits. Preview SHALL use test data/payments and never mutate production or Vesper. Checkout SHALL fail closed until commerce, shipping, and tax settings are complete.

#### Scenario: Missing runtime configuration
- **WHEN** production lacks its database, provider mode/webhook, shipping, or recorded tax settings
- **THEN** readiness or checkout configuration validation fails clearly without accepting a payment or pretending inventory exists

#### Scenario: Protected preview commerce
- **WHEN** a preview deployment runs the checkout/admin acceptance suite
- **THEN** it uses isolated test data and test payments, remains unindexed, and changes no production or Vesper records

#### Scenario: Shared VPS resource isolation
- **WHEN** Good Apollo serves customer traffic or processes image/maintenance work
- **THEN** configured CPU, memory, database-connection, and storage limits are enforced and monitoring confirms other VPS services remain healthy

### Requirement: Durable maintenance and readiness monitoring

The system SHALL run authenticated, retry-safe maintenance at least every five minutes for uncertain/expired payments, retryable provider processing, email delivery, and stock reconciliation. It SHALL expose status-only health/readiness checks and operator alerts for missing maintenance, unresolved holds, failed deliveries, and stock drift. Two missed maintenance intervals SHALL produce an alert; unresolved checkout attempts older than one hour SHALL appear for attention.

#### Scenario: Webhook missing and application restart
- **WHEN** the expiration webhook is lost and the application restarts
- **THEN** persisted maintenance work still verifies provider state, safely releases expired unpaid stock, and records recovery

#### Scenario: Scheduled work stops
- **WHEN** no successful maintenance run occurs for two five-minute intervals
- **THEN** the responsible operator receives a meaningful failure alert and can inspect the last successful run

#### Scenario: Public readiness response
- **WHEN** an unauthenticated visitor requests the health/readiness route
- **THEN** the response discloses status without credentials, database connection details, or customer/order data

### Requirement: Recoverable database and product photos

The system SHALL back up Good Apollo database/history and referenced private Garage media to encrypted storage outside the production VPS. Document a maximum 24-hour backup loss window and a four-hour recovery target. Before launch, a separate-environment restore SHALL demonstrate usable product/gallery, stock/ledger, and order records. Restoring old data over newly accepted orders SHALL require reconciliation and SHALL not be automatic.

#### Scenario: Restore evidence
- **WHEN** the launch restore exercise restores the database and sample media into a separate environment
- **THEN** a product gallery loads and its variants, ledger totals, and historical order snapshots agree with the backed-up records

### Requirement: Private and bounded self-hosted media storage

The system SHALL use environment-specific Garage buckets and dedicated scoped keys. Photo uploads SHALL pass through the authenticated same-origin application endpoint, which validates the session, origin, intent, exact byte count and MIME type before storing the object. Garage SHALL remain private on the VPS data network. Originals and admin interfaces SHALL remain private; only validated published derivatives are served publicly through the application media route.

#### Scenario: Authorized product photo upload
- **WHEN** an authenticated operator uploads an image for a product they can edit
- **THEN** the signed request can write only to the intended Good Apollo bucket/key within configured byte/type limits, and finalization validates and processes the image before publication

#### Scenario: Storage boundary failure
- **WHEN** a request comes from an unapproved origin or addresses an unowned key
- **THEN** the write is rejected, private originals remain inaccessible, and the operator receives a recoverable error without affecting unrelated VPS services

### Requirement: Bounded self-hosted media capacity

Single-node Garage has no bucket quota. The app SHALL account original and derivative bytes against a configurable 4 GiB default budget. Existing objects SHALL be reconciled before uploads are enabled. The VPS SHALL warn when disk use reaches 90% (10% free), with a configured and verified notification route.

#### Scenario: App media budget reached
- **WHEN** a photo would exceed the configured app media budget
- **THEN** finalization is rejected and the operator receives a recoverable error

#### Scenario: Host disk pressure alert
- **WHEN** monitored VPS disk usage reaches 90% (10% free)
- **THEN** the operator receives an alert before shared storage threatens other services, and app uploads remain capped by the independent media budget

### Requirement: Guarded transactional email delivery through Mautic

The system SHALL send Good Apollo buyer/operator transactional notifications through a private authenticated adapter to the guarded Good Apollo Mautic delivery path. The website's durable outbox SHALL remain authoritative for deduplication, delivery state, retry limits, and uncertain-outcome reconciliation. Good Apollo messages SHALL use the registered Good Apollo sender identity and SHALL NOT use Senna's sender identity or newsletter admission/marketing controls.

#### Scenario: Transactional notification delivery
- **WHEN** a paid order or shipment commits and its outbox item is eligible
- **THEN** the private adapter submits the approved Good Apollo message through Mautic and records the provider receipt against that outbox item without changing the business transaction

#### Scenario: Mautic timeout or unavailable service
- **WHEN** the provider result is ambiguous or Mautic is unavailable
- **THEN** the outbox item remains durable, is not blindly duplicated, and is retried only after the configured reconciliation policy permits it

### Requirement: Safe migration and rollback

The system SHALL import existing placeholder catalog entries as unpublished drafts with zero stock, preserve product URLs, and avoid overwriting operator edits on repeated seeds. Deployment SHALL apply versioned migrations and verify server-route output. A rollback SHALL disable new checkout while continuing verified webhook/recovery processing for existing sessions and SHALL preserve new order/history data.

#### Scenario: Repeat draft import
- **WHEN** draft seed/import runs after an operator has edited a product and counted stock
- **THEN** operator content and balances are preserved and no placeholder product is published automatically

#### Scenario: Disable sales during an incident
- **WHEN** new checkout is disabled after a deployment issue
- **THEN** no new payable sessions are created while previously created paid/open sessions can still be reconciled without resetting stock

### Requirement: Accurate launch content and indexing

Before public sales, the store SHALL contain real product photos, verified descriptions/variant prices/stock, concrete shipping service/processing information, reachable contact details, and reviewed privacy/terms/final-sale/support content consistent with its operations. Public published pages SHALL become indexable only at launch, with accurate sitemap and product availability/price data. Admin, cart, private order/status, draft, and preview pages SHALL remain unindexed.

#### Scenario: Launch product content review
- **WHEN** a listing still has placeholder photos, unverified stock, or incomplete shipping/support content
- **THEN** it fails the launch checklist and is not made saleable through the launch procedure

#### Scenario: Enable public discovery
- **WHEN** the verified store launches
- **THEN** public published product/shop pages have correct canonical URLs and indexing/structured data while private and preview routes remain protected and unindexed

### Requirement: Concrete commerce and operator acceptance evidence

Launch SHALL require evidence for stock concurrency, payment-event recovery, financial/shipping records, admin denial, image processing, email retry, fulfillment/refunds, accessible operator tasks, production-like deployment, restore, and domain/HTTPS. Verify live endpoint configuration without creating a synthetic charge. Record environment, revision, outcome, open failures, and operator readiness without secrets.

#### Scenario: Evaluate launch readiness
- **WHEN** any required acceptance case fails or the primary operator cannot complete the timed workflows independently
- **THEN** public sales remain disabled and the failed outcome is recorded for correction before launch

#### Scenario: Test-mode end-to-end order
- **WHEN** a test customer buys a multi-variant cart and the operator packs, ships, refunds, and explicitly restocks eligible merchandise
- **THEN** the evidence shows exact order/stock/payment transitions and delivered notifications without a live charge
