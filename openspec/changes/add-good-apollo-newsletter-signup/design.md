# Design

## Context

See proposal.md for motivation. Good Apollo is Astro 7 on Vercel with Prisma/Postgres and an outbox for transactional order email. `src/pages/privacy.astro` currently describes use for shop operations only. No newsletter code or current OpenSpec main specs exist; the physical-commerce proposal remains independently in progress with substantial unrelated uncommitted work.

## Goals / Non-Goals

**Goals:** Add public signup and preference pages that use infra's canonical consent/delivery ledger without placing Mautic credentials or a second subscriber directory in the storefront database.

**Non-Goals:** Newsletter delivery implementation, automatic subscriber content, order/account linkage, sales launch, CRM, or support for sending newsletter from the transactional outbox.

## Decisions

### Keep newsletter state in infra's consent ledger

The browser posts only to Good Apollo server routes. Those routes validate same-origin requests and input, apply bounded per-client rate controls, and forward a minimal command to the reviewed infra endpoint using a dedicated HMAC shared secret, timestamp, nonce/idempotency key and signed body hash. The secret is available only in server environment variables and the infra protected runtime. Verify the exact registered brand and signature in infra; reject stale/replayed signatures. Do not call Mautic from browser code or create subscription/contact records in the commerce Prisma database.

Infra owns pending confirmation, the encrypted durable Mautic confirmation queue, append-only brand permission and Mautic reconciliation. Signup returns a generic pending response whether address is new, already pending, subscribed or withdrawn. The site sends its opaque confirmation token only in the authenticated server-to-server signup request; Infra verifies it matches the supplied hash and stores it AES-256-GCM encrypted under a separately protected runtime key. The token is never stored in Good Apollo's transactional outbox, a contact field, logs or analytics. Mautic sends one confirmation message only after explicit new/reconfirmation request under a separate queue, cap and final-wire guard; it consumes Good Apollo's bounded capacity and does not imply an edition subscription until confirmed. If production gates remain closed or the queue cannot durably accept the request, do not pretend the message was sent; return a generic service-unavailable/retry state. No confirmation sender is provisioned through the transactional SMTP outbox.

### Make confirmation and unsubscribe explicit user actions

Email links land on Good Apollo pages with opaque short-lived tokens. GET renders a review page without changing state; POST performs confirmation/unsubscribe. Infra receives the bound command and consumes the token once. Success appears only after durable acknowledgement; uncertain requests retain an operator-visible reconciliation state and the UI offers retry without revealing subscriber membership.

### Keep page behavior accessible and low-friction

Add an optional footer/newsletter section consistent with existing design tokens. Explain that the message is an occasional Good Apollo Goods newsletter, require affirmative submit, and do not prefill from an authenticated buyer/admin or checkout. Use status text and focus management compatible with keyboard and screen readers. Preference and confirmation screens preserve the existing public shell without account navigation.

Update the privacy page with the purpose (newsletter delivery and preferences), consent/confirmation flow, Mautic processing, shared Google sending provider, unsubscribe behavior, retention contact and distinction from order communications. Avoid claiming a fixed cadence before owner selection.

### Configure a narrow inter-service caller

Add placeholder-only `NEWSLETTER_API_URL` and `NEWSLETTER_HMAC_SECRET` validated only when newsletter feature is enabled. Default feature flag false. Production Vercel secret is separate per environment; no secrets in Git/Jira/preview output. Endpoint errors are sanitized and never log email, tokens, HMAC, or response payload. Use existing privacy-safe client identity/rate-limit utilities rather than adding another dependency.

## Risks / Trade-offs

- Infra deployment may be delayed: feature remains disabled and storefront commerce works as before.
- Cross-system timeout: stable idempotency keys and generic response allow safe retry; infra reconciles before repeating native mutation.
- HMAC replay/spoofing: bind timestamp, nonce, brand, method/path and body digest; reject expired/reused signatures and rate limit public routes.
- Preference scanners can prefetch links: state-changing actions require explicit POST after a confirmation page.
- Owner-selected copy and cadence are not known: signup must describe no unchosen schedule and campaign remains closed.

## Migration Plan

1. Implement only in Good Apollo's existing local/test database and isolated test config; mock the infra endpoint for normal tests and verify the signed protocol separately against an isolated fixture.
2. Add feature-disabled-by-default pages/routes, placeholder environment validation, unit/integration/browser tests and truthful privacy copy. Preserve transactional `email.ts` behavior.
3. Coordinate the infra signed endpoint and internal signup/confirmation acceptance; exercise timeout, replay, scanner GET, duplicate and cross-brand unsubscribe cases with synthetic contacts.
4. Configure protected preview with newsletter disabled, deploy and verify no real signup/send. After infra accepts provider receipts and the owner supplies the footer/cadence/cap/edition and explicitly authorizes public newsletter activation, configure production Vercel secrets/feature gate and observe a natural first send.

Rollback: disable the feature flag and hide signup links. Keep any accepted permission/withdrawal events in infra; do not delete or replay them. Leave orders and transactional outbox untouched.

## Open Questions

None block this implementation plan. Newsletter cadence, numeric limits, display name, postal footer and first edition are intentionally deferred to the separate infra activation gate.
