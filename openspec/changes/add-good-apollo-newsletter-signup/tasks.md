# Tasks

## 1. Consent and service contract

- [ ] 1.1 Add newsletter pending/confirmed/withdrawn state to Good Apollo's Prisma schema only if required for local request state; otherwise keep authoritative permission in infra. Verify migration preserves existing commerce data and transactional outbox.
- [ ] 1.2 Implement typed HMAC-signed server-to-server signup, confirm and unsubscribe client with timestamp, replay protection and idempotency; verify exact signing contract against isolated infra fixtures and no credentials/email/tokens appear in logs.
- [x] 1.3 Add default-off validated feature/environment controls and safe generic service errors; verify missing credentials keep endpoints disabled without affecting shop routes.
- [x] 1.4 Forward the opaque confirmation token only in the authenticated server-to-server signup request so Infra can durably enqueue it encrypted; verify the token matches its hash, is never placed in the local transactional outbox/logs, and the site acknowledges non-enumeratively only after an accepted Infra response.

## 2. Visitor experience

- [ ] 2.1 Add accessible optional signup section/page with affirmative consent and no checkout/account coupling; verify desktop/mobile/keyboard/screen-reader form states and non-enumerating confirmation responses.
- [x] 2.2 Add GET-safe confirmation and unsubscribe landing pages that require explicit POST; verify expiry, replay, duplicate and service timeout flows never falsely claim a state change. Evidence: newsletter browser checks passed 2/2 with no mutating requests on GET; application unit/API checks cover confirmation POST, token validation, RFC 8058 unsubscribe and safe service failures; isolated Infra suite covers expiry/replay/withdrawal state transitions. The live Netlify canary's exact origin is now allowed for token actions while unrelated origins remain rejected; Justin's original confirmation reached the durable confirmed state.
- [x] 2.3 Update privacy policy with the actual newsletter purpose, provider roles, consent/withdrawal and contact/retention details; verify copy makes no unsupported cadence or sale promise.
- [x] 2.4 Keep `src/server/email.ts` limited to transactional mail; verify newsletter code never enters order/sign-in/shipment outbox or causes a commerce activation change.

## 3. Integrated readiness

- [ ] 3.1 Add isolated unit/integration/browser cases for purchase-without-consent, no-account signup, duplicate requests, confirmation reuse, unsubscribe retries, scanner GET, cross-brand independence and service outage; verify only disposable `_test` data is used.
- [x] 3.2 Add operator documentation and placeholder-only environment examples for endpoint/key setup, disabled feature flag, Vercel preview/production secret separation and rollback; verify commands follow AGENTS.md.
- [ ] 3.3 Run documented `npm run check`, `npm test`, `npm run build:local` and `npm run test:browser` sequentially with isolated `_test` databases; verify functionality with Mautic/commerce sending disabled and no live subscriber import.
- [ ] 3.4 Configure only a protected preview after infra endpoint acceptance; verify the public signup control remains hidden/disabled and real mail/provider calls cannot occur.

## Workflow follow-up

- Enable public signup only after owner review and confirmed durable infrastructure readiness. Newsletter sending requires the separate infra release gate and explicit launch authorization.
- Sync this change to the project's Jira/Confluence after planning and implementation batches as required by AGENTS.md.
