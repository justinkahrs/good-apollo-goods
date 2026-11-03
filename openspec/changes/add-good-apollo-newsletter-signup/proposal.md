# Proposal

## Why

Good Apollo Goods needs an explicit way for visitors to request its newsletter and control that permission independently of purchases and other brands. The signup must be ready before the separately managed Mautic delivery release; commerce remains disabled until its own existing launch checks pass.

## What Changes

- Add an accessible newsletter signup with clear brand/purpose language and a confirmation step.
- Send subscription intents from the Astro server to the guarded Senna infrastructure endpoint using a private shared signing secret and replay-resistant idempotency key.
- Provide branded confirmation and unsubscribe/preference experiences, immediate visible unsubscribe success after durable acknowledgement, and privacy disclosure.
- Keep newsletter permission separate from guest checkout, customer accounts, order/shipment/sign-in email, Stripe sales controls and any CRM.
- Keep campaign activation, subscriber import and real newsletter sending disabled until infra acceptance, owner inputs and separate release authorization.

## Capabilities

### New Capabilities

- `newsletter-subscriptions`: visitor consent, confirmation and withdrawal for Good Apollo newsletter messages without commerce-account requirements.

### Modified Capabilities

None.

## Impact

Astro public layout/footer and privacy page, validated server configuration, narrowly scoped public/server routes, existing Prisma database migration, isolated email/outbox integration, tests and operator docs. Production form delivery requires a private endpoint and secret coordinated with the infra Mautic implementation. No SuiteCRM work is included.

## Non-goals

No checkout opt-in, account requirement, promotional texts, subscriber import, automatic campaign launch, CRM, changes to transactional messages or storefront sales activation. Prelaunch subscribers are not emailed without separate authorization.

## Success

A visitor can request the Good Apollo newsletter, confirm ownership, and withdraw permission; duplicate/replayed submissions do not create duplicate subscriptions; a purchase alone never subscribes; and privacy/transactional email behavior remains accurate. Isolated tests and documented checks pass with all live send gates closed.
