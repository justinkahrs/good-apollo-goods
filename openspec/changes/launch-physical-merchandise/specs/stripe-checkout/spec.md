# Stripe checkout

## Purpose

Let customers pay for physical merchandise through guest checkout while protecting prices, stock, order identity, and personal information against stale carts, retries, and unreliable provider delivery.

## ADDED Requirements

### Requirement: Authoritative cart quotes

The system SHALL accept only bounded variant identities and positive integer quantities as cart purchase requests and SHALL resolve current display content, prices, publication, and availability on the server. It SHALL reject malformed, empty, inactive, unavailable, or oversized requests and require acknowledgment of changed prices before checkout. Browser-supplied totals, names, currency, tax, shipping, and payment claims SHALL not control an order.

#### Scenario: Tamper with cart price
- **WHEN** a customer changes a stored `$72.00` hat price to `$0.01` before checkout
- **THEN** the server resolves the real price and no payable session uses the forged amount

#### Scenario: Price changed while browsing
- **WHEN** the operator changes a variant price after the customer loaded its cart
- **THEN** checkout shows the revised quote and requires customer acknowledgment before creating the payment session

#### Scenario: Duplicate lines and invalid quantities
- **WHEN** a request repeats a variant or includes a negative, fractional, or excessive quantity
- **THEN** equivalent valid lines are normalized before checking limits and invalid requests are rejected without reserving stock

### Requirement: Versioned safe preview-cart migration

The system SHALL replace the old slug/size/client-price preview cart with a versioned variant/quantity cart. Legacy or corrupt storage SHALL be cleared with a useful explanation, and cart/product content SHALL be rendered without executing markup from storage or product input.

#### Scenario: Existing preview shopper
- **WHEN** a customer opens the new store with an old preview cart
- **THEN** the customer is told to reselect current variants and no legacy placeholder item starts checkout

#### Scenario: Inject markup into storage
- **WHEN** a localStorage item contains script or HTML in a name, slug, or option
- **THEN** the page does not execute it and rejects or safely ignores the malformed item

### Requirement: Idempotent guest payment sessions

The system SHALL allow guest checkout and create immutable pending orders and whole-cart holds before hosted Stripe checkout. Retries SHALL reuse the owned attempt and original provider request; a changed cart requires a new attempt. Session content and URLs are server-controlled. Launch payment methods exclude delayed types and features that bypass reservations.

#### Scenario: Multi-product guest checkout
- **WHEN** a guest purchases two hat sizes and an accessory from a valid quote
- **THEN** one session includes the exact item quantities/prices, obtains contact/shipping data, and links to one pending local order

#### Scenario: Double click and connection retry
- **WHEN** the same checkout attempt is submitted twice concurrently or retried after a timeout
- **THEN** it produces at most one provider session and one set of order/hold records

#### Scenario: Provider create uncertainty
- **WHEN** the provider creates a session but the application fails before saving its identity
- **THEN** recovery uses the persisted attempt/request to resolve that session and does not create an independent second session or release uncertain stock

### Requirement: Verified monotonic payment processing

The system SHALL accept payment/refund events only after verifying the raw-body signature, mode, store association, order/session/payment identity, line quantities/prices, shipping/tax configuration, currency, and reconciled totals. Paid state and stock effects SHALL apply once through authoritative processing, independent of redirect visits. Duplicate, concurrent, replayed, and out-of-order events SHALL not regress paid orders. Transient processing failures SHALL remain retryable.

#### Scenario: Signed paid confirmation
- **WHEN** an authentic matching session is verified paid
- **THEN** the order is recorded paid once, its reserved units are consumed once, and one confirmation notification is durably queued

#### Scenario: Invalid signature or unrelated store
- **WHEN** a request has no valid signature, an unexpected live/test mode, or another store's checkout identity
- **THEN** it cannot mark an order paid, consume stock, or reveal customer data

#### Scenario: Mismatched totals or items
- **WHEN** an authentic event's authoritative session has quantities, prices, currency, shipping selection, or totals inconsistent with the pending order/configuration
- **THEN** the order is flagged for attention, packing is blocked, and automatic fulfillment does not proceed

#### Scenario: Event replay after commit
- **WHEN** payment delivery repeats after the first transaction committed but its HTTP response was lost
- **THEN** processing returns a safe duplicate outcome without repeating stock movements or notifications

### Requirement: Explicit unpaid and expired outcomes

The system SHALL distinguish open, processing, paid, failed, and expired payment outcomes. A nominal expiration or success/cancel redirect SHALL not prove a terminal payment state. A definitively expired unpaid session SHALL release holds, and unexpected asynchronous outcomes SHALL reconcile safely even while delayed methods are disabled for new sessions.

#### Scenario: Success page before webhook
- **WHEN** the customer arrives at success before authoritative payment processing completes
- **THEN** the page shows processing and later reflects paid status without fulfilling based on the URL

#### Scenario: Processing exceeds the hold deadline
- **WHEN** a completed but unpaid session is still processing past its nominal hold deadline
- **THEN** it stays in a non-packable state and the hold remains until a verified definitive outcome

#### Scenario: Explicit checkout cancellation
- **WHEN** a guest requests cancellation of its open attempt
- **THEN** the application confirms provider expiration before releasing stock and reports any concurrent paid outcome correctly

### Requirement: Private guest order status and precise cart clearing

The system SHALL require an unguessable authorization capability bound to the guest/order to expose order status or details. A bare order ID or session ID SHALL not expose email/address. Private status responses SHALL not be publicly cached. After paid confirmation, the cart SHALL remove only purchased quantities belonging to that attempt.

#### Scenario: Guess another order
- **WHEN** a visitor requests another order's identifier without its authorization capability
- **THEN** no customer contact, address, or private order details are disclosed

#### Scenario: Shopper adds items while paying
- **WHEN** a shopper adds another item in a second tab before returning from a paid attempt
- **THEN** confirmation clears the purchased quantities and retains later unrelated cart additions
