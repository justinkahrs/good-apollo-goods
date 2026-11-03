# Newsletter subscriptions

## Purpose

Let visitors request and confirm Good Apollo Goods newsletter email, then control that permission separately from purchases, store accounts and other brands.

## ADDED Requirements

### Requirement: Signup captures explicit newsletter consent
The public site SHALL state that the visitor is requesting Good Apollo Goods newsletter email and provide a distinct optional signup action. A purchase, customer email, account, support inquiry or prechecked control SHALL NOT subscribe anyone.

#### Scenario: A visitor submits the newsletter form
- **WHEN** a valid email is submitted from the public signup form
- **THEN** the site records a pending Good Apollo newsletter request and presents a non-enumerating confirmation response

#### Scenario: A visitor checks out without newsletter consent
- **WHEN** an order is placed without separately confirmed newsletter permission
- **THEN** the newsletter system has no subscription for that order email

### Requirement: Address ownership is confirmed before enrollment
Only a current, single-use, time-limited confirmation intent SHALL create newsletter subscription permission. Confirmation tokens SHALL be bound to the Good Apollo audience and recipient, stored without plaintext, and SHALL NOT expose subscriber existence.

#### Scenario: A pending subscriber confirms
- **WHEN** the recipient submits a valid confirmation action
- **THEN** the site activates that Good Apollo subscription idempotently and acknowledges success

#### Scenario: An expired or replayed confirmation is submitted
- **WHEN** a confirmation token is expired, already consumed or unknown
- **THEN** the site does not create or restore permission and gives a safe recovery instruction

### Requirement: Subscription is stored independently of commerce
Newsletter permission SHALL be recorded independently of orders, guest sessions and store accounts, with request source, consent time and status. Subscribers SHALL NOT need a Good Apollo account. A Mautic contact match alone SHALL NOT imply permission.

#### Scenario: A visitor subscribes without a store account
- **WHEN** a confirmed visitor has no account or order
- **THEN** the newsletter permission remains usable without creating a commerce identity

### Requirement: Unsubscribe is visible and retry-safe
Each newsletter message SHALL link to a Good Apollo branded unsubscribe action. A valid submission SHALL durably withdraw Good Apollo permission and acknowledge only after the stop is recorded or safely queued. GET requests SHALL NOT unsubscribe; repeated submissions SHALL be idempotent. An unsubscribe SHALL NOT cancel an order or suppress required sign-in/shipping email.

#### Scenario: A recipient unsubscribes
- **WHEN** a recipient confirms the branded unsubscribe action
- **THEN** future Good Apollo newsletter delivery is held and the page confirms the preference change

#### Scenario: A message preview opens the unsubscribe link
- **WHEN** a mail security scanner requests the unsubscribe URL with GET
- **THEN** no preference changes until the recipient makes the explicit confirmation action

### Requirement: Newsletter service failure stays safe
The site SHALL not report signup confirmation or unsubscribe success unless the durable Good Apollo service acknowledges the idempotent request. Temporary service failures SHALL preserve a recoverable state and provide a retry path without exposing subscriber status or credentials.

#### Scenario: Newsletter service is unavailable
- **WHEN** the site cannot obtain an authoritative response
- **THEN** it does not claim consent was saved or withdrawn and offers a safe retry message

### Requirement: Newsletter activity does not activate commerce or delivery
Implementing signup SHALL NOT enable storefront checkout or newsletter sending. No campaign, bulk import or first subscriber message SHALL occur without separately approved Mautic acceptance, owner cadence/cap inputs and launch authorization.

#### Scenario: Signup is live while sending remains closed
- **WHEN** a visitor confirms during the prelaunch period
- **THEN** the permission is durably recorded and no newsletter is sent
