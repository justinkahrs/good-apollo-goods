# Inventory control

## Purpose

Maintain reliable stock per physical merchandise variant, give the operator understandable balances and corrections, and prevent overselling across concurrent payments and off-site stock changes.

## ADDED Requirements

### Requirement: Understandable auditable variant balances

The system SHALL show Available to sell, Held at checkout, and Unsold stock for every variant, with available equal to unsold minus held. Unsold stock SHALL exclude paid items awaiting packing. All quantities SHALL be nonnegative integers, and every balance change SHALL retain its reason, actor or system source, timestamp, and unique operation reference.

#### Scenario: Read a held balance
- **WHEN** a variant has three unsold units and one unit held for checkout
- **THEN** the operator sees two available units, one held unit, and three unsold units with an explanation of the labels

#### Scenario: Review a stock change
- **WHEN** the operator opens the history of a sold variant
- **THEN** the initial stock, checkout hold, sale, and any correction remain traceable without replacing earlier entries

### Requirement: Safe routine stock adjustments

The system SHALL allow adding stock, removing damaged stock, recording off-site sales/consignment transfers, and setting an actual unsold count with a reason and resulting balance preview. Adjustments SHALL preserve active holds and reject a resulting unsold count below held stock. A repeated adjustment submission SHALL take effect once.

#### Scenario: Record consignment stock
- **WHEN** an operator records two units sent to a stockist from five available units
- **THEN** available studio stock becomes three, the reason is retained, and no online order/payment is fabricated

#### Scenario: Count conflicts with a hold
- **WHEN** an operator tries to set unsold stock to zero while one unit is held
- **THEN** the change is rejected with a visible explanation and existing stock/holds are preserved

#### Scenario: Retry a restock form
- **WHEN** the same add-stock operation is retried after a network timeout
- **THEN** the added quantity appears once in the balance and movement history

### Requirement: Atomic whole-cart checkout reservations

The system SHALL reserve all requested variant quantities as one operation before issuing a payable session. It SHALL recheck publication, active state, quantities, and current availability, and SHALL reject the whole cart without partial holds when any line is unavailable. A browser cart alone SHALL not reserve stock.

#### Scenario: Compete for the last unit
- **WHEN** two independent customers concurrently request checkout for the last available unit
- **THEN** at most one receives an active payable session and the other receives a stock message without negative availability

#### Scenario: One invalid line in a cart
- **WHEN** a cart contains two available hats and an unavailable accessory
- **THEN** no units are reserved for any line and the customer can correct the unavailable line

### Requirement: Consume stock once on authoritative payment

The system SHALL consume the reserved quantities once after authoritative paid confirmation, reducing unsold and held quantities equally. Shipment SHALL not subtract inventory a second time. Separate events for the same payment and concurrent event handling SHALL converge on one sale movement.

#### Scenario: Paid multi-variant order
- **WHEN** one paid order includes small and medium variants of the same product
- **THEN** each variant's exact quantity is consumed once and the order becomes eligible for packing

#### Scenario: Duplicate paid delivery and shipping
- **WHEN** duplicate paid confirmations arrive and the operator later marks the order shipped
- **THEN** only the original paid transition consumes inventory and shipping leaves the stock balance unchanged

### Requirement: Release only definitively unpayable reservations

The system SHALL release a hold once when provider state confirms an unpaid expired session, canceled open session, or a definitively failed payment/session that cannot be retried into a paid outcome. A browser cancel URL, card decline within an open session, local timeout, nominal hold expiry, or uncertain provider call SHALL not release stock by itself. Processing payments SHALL retain stock until a definitive outcome is verified.

#### Scenario: Cancel by navigating back
- **WHEN** a customer visits the cancel page while the provider session remains open
- **THEN** the stock remains held until a server-verified expiration/cancellation or terminal failure

#### Scenario: Card decline in a retryable session
- **WHEN** a customer's card is declined but the same Checkout Session remains open for another payment attempt
- **THEN** the original stock stays held and another customer cannot buy it while that session is payable

#### Scenario: Missing expiration webhook
- **WHEN** an unpaid provider session expires and its webhook is not delivered
- **THEN** scheduled reconciliation verifies expiry and restores available stock within five minutes of a successful reconciliation opportunity

#### Scenario: Session creation timed out
- **WHEN** session creation times out after the provider might have accepted the request
- **THEN** the reservation remains unavailable for new buyers and appears for reconciliation without creating a second payable session

### Requirement: Monotonic stock recovery and attention handling

The system SHALL prevent stale/duplicate terminal events from undoing a committed sale or repeating a release. If payment is unexpectedly confirmed after release, it SHALL reconcile all ordered units atomically when stock is available; otherwise it SHALL mark the paid order for attention, block shipment, and offer a refund resolution without negative stock. Ledger discrepancies and overdue unresolved holds SHALL be visible to the operator.

#### Scenario: Expiry after payment
- **WHEN** an old expiration event arrives after the order is already paid
- **THEN** sold quantities remain consumed and no stock is returned

#### Scenario: Late paid order without stock
- **WHEN** a released order is unexpectedly confirmed paid after the stock was sold elsewhere
- **THEN** the paid order is blocked from fulfillment and identified for resolution without overselling or fabricating stock

#### Scenario: Low stock view
- **WHEN** a variant's available balance reaches the configured low-stock threshold
- **THEN** it appears in the operator's low-stock view using available stock rather than unsold stock
