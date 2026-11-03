# Order fulfillment

## Purpose

Give the operator a complete physical order workflow from paid confirmation through packing, shipment, exceptional refunds, and deliberate stock recovery while preserving accurate historical records.

## ADDED Requirements

### Requirement: Explicit shipping and tax configuration

The system SHALL use one uniform flat USD rate for all U.S. destinations, including Alaska and Hawaii. Checkout SHALL collect recipient, address, and email and show processing, shipping, tax, and total before payment. The owner SHALL decide tax configuration; settings are server-controlled and snapshotted in each order. Rates and registrations SHALL NOT be inferred from placeholders.

#### Scenario: Supported shipping address
- **WHEN** a customer provides an allowed destination
- **THEN** checkout shows the approved service, shipping amount, configured taxes, and final total and the paid order retains the selected service/address

#### Scenario: Unsupported destination
- **WHEN** a customer tries to order to a destination outside the approved shipping scope
- **THEN** checkout cannot accept the order using an invented or zero shipping rate

#### Scenario: Unconfigured shipping or tax
- **WHEN** the shipping service or recorded tax configuration decision is missing
- **THEN** public checkout stays unavailable and the operator is shown the missing launch setting

### Requirement: Immutable complete purchase records

The system SHALL preserve item names, variant option values/SKUs, quantities, unit amounts, currency, subtotal, shipping, tax, discounts, total, purchase email, and delivery address independently of subsequent catalog/settings edits. Financial totals SHALL reconcile, and provider allocations SHALL not be assigned arbitrarily to the first line of a multi-item order.

#### Scenario: Product and shipping edits after payment
- **WHEN** the operator changes a product's name/price and shipping settings after an order is paid
- **THEN** the order, packing slip, and notification retain the purchased item and shipping snapshots

### Requirement: Paid orders to pack and safe shipment

The system SHALL provide an order list filtered by payment, fulfillment, and attention state, with Paid / To pack as the default. Only paid, uncanceled, unblocked orders SHALL be packable. The operator SHALL view exact items/address, print a packing slip, and record one full-order shipment with carrier, tracking number, safe tracking URL, and shipped time. Repeated shipment submissions SHALL take effect once.

#### Scenario: Pack and ship a paid order
- **WHEN** an operator opens a paid order, prints its slip, enters carrier/tracking, and marks it shipped
- **THEN** the order records one shipment and queues one shipment notice without subtracting stock again

#### Scenario: Unpaid or blocked shipment
- **WHEN** the operator attempts to ship a pending payment or a paid stock-exception order
- **THEN** shipment is rejected with an understandable reason and no shipment notice is sent

#### Scenario: Repeat mark shipped
- **WHEN** the same shipment form is retried after a response timeout
- **THEN** one shipment and one shipment notification remain recorded

### Requirement: Durable customer and operator notifications

The system SHALL durably queue order confirmation, operator new-order notice, and shipment notice after their business transitions. Notifications SHALL contain accurate item/total/order or carrier/tracking information, deduplicate by business transition, and expose delivery failure/retry to the operator without rolling back a paid order or stock movement.

#### Scenario: Mail provider unavailable after payment
- **WHEN** payment is recorded while the email service is unavailable
- **THEN** the order remains paid and packable, the pending message survives a process restart, and a later retry delivers the confirmation

#### Scenario: Replayed shipment event
- **WHEN** the same shipment transition is processed again
- **THEN** it does not create another intended shipment notification

### Requirement: Independent cancellation and refund state

The system SHALL separate payment, refund, and fulfillment state. Authorized operators SHALL cancel unshipped orders and request full or monetary partial refunds up to the remaining paid amount using retry-safe actions. Provider-created refunds SHALL synchronize into the order. A requested, failed, or pending refund SHALL not be reported as successful; full refunds SHALL block new shipment without erasing earlier shipment history.

#### Scenario: Partial refund from provider dashboard
- **WHEN** a matching successful partial refund is received from Stripe
- **THEN** the order shows the refunded and remaining amounts, preserves its item/fulfillment history, and adds no stock automatically

#### Scenario: Failed full refund request
- **WHEN** an operator requests a full refund and the provider rejects it
- **THEN** the order shows a failed refund action with a retry/resolution path and does not falsely show refunded payment

#### Scenario: Cancel an unshipped paid order
- **WHEN** an operator cancels a paid order that has not shipped
- **THEN** it leaves To pack, any requested refund follows its own provider state, and inventory is unchanged until explicit restocking

#### Scenario: Refund arrives before paid confirmation
- **WHEN** a successful full refund is delivered before the original paid callback
- **THEN** reconciliation records the original paid/refunded history once and does not make the refunded order packable when the older paid callback arrives

#### Scenario: Shipment races with cancellation
- **WHEN** shipment and cancellation requests arrive concurrently for an unshipped order
- **THEN** only a valid serialized state transition succeeds and the other reports the changed order state

### Requirement: Payment dispute attention

The system SHALL associate verified payment disputes with their orders, show current status and provider response deadline, notify the operator, and block new shipment while a dispute remains unresolved. Shipment and payment history SHALL remain available for manual provider-dashboard evidence handling. Disputes SHALL not automatically refund or restock merchandise.

#### Scenario: Unshipped payment disputed
- **WHEN** an authentic dispute is associated with a paid unshipped order
- **THEN** the order appears for attention with its response deadline and provider link and cannot ship until the blocking state is resolved

#### Scenario: Shipped order disputed
- **WHEN** a shipped order receives a dispute
- **THEN** its original shipment/tracking record remains available and stock does not increase

### Requirement: Explicit physical restocking

The system SHALL let the operator deliberately restock specified order-item quantities only after confirming an unshipped canceled item's presence or a returned item's receipt and sellable condition. Restock quantities SHALL not exceed sold quantities minus prior restocks. The action SHALL retain a reason and apply once. Financial refunds alone SHALL never restock merchandise.

#### Scenario: Refund a lost parcel
- **WHEN** an operator refunds a shipped order whose items have not returned
- **THEN** financial state changes and available stock does not increase

#### Scenario: Restock an unshipped cancellation
- **WHEN** the operator confirms a canceled unshipped hat remains present and sellable and restocks one unit
- **THEN** one unit returns to unsold/available stock with an order-linked history entry and a retry does not add it again

#### Scenario: Excessive restock
- **WHEN** an operator tries to restock more units than remain eligible on the order item
- **THEN** the request is rejected without increasing inventory
