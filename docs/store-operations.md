# Store operations

Responsibility: Justin owns application/infrastructure recovery; the studio operator manages products, counts and fulfillment. Confirm a reachable developer contact and backup operator before launch.

## Monitoring and maintenance

Run `/api/maintenance/` every five minutes from the dedicated Good Apollo scheduler in `~/projects/infra/n8n/workflows/good-apollo-goods/maintenance.sdk.js`, using the production `CRON_SECRET` stored in the n8n HTTP Bearer credential. The runner persists a four-minute lease, bounds each batch and records its successful run. Settings shows overdue holds, ledger differences and pending/failed notifications. Reconciliation always queries current provider state. An expired local timer does not establish an unpaid Stripe outcome. Keep the schedule inactive until production commerce is configured, and never run a second Vercel Cron schedule at the same time.

`/api/health/` returns status only; it never exposes database URLs, order IDs or customer data. Configure an independent uptime monitor to request it regularly and notify Justin when unhealthy. A monitor must remain independent of the scheduler it watches. Two missed five-minute intervals, holds older than an hour, repeated mail failures and ledger drift require investigation. Deployment is not ready until the monitor and alert delivery are exercised.

An independent monitor can also invoke `/api/monitor/` with the cron bearer secret. That route records deduplicated alerts and delivers alert mail without relying on a running commerce worker. The monitor must send its own failure/timeout notification when this route or SMTP is unavailable. New checkout fails closed on stale maintenance, overdue unresolved holds, repeated mail failures or ledger drift; existing payment reconciliation stays available.

Provider events and email work have durable leases/retry records. Re-running recovery is safe. Failed email leaves payment/stock/shipment committed. The outbox deduplicates intended messages by transition and retains retries across restarts. SMTP delivery may duplicate after a crash at the provider-acceptance/DB-acknowledgment boundary. Review status before manually sending an additional notice.

## Incidents

Disable `SALES_ENABLED` to stop new payable sessions; deploy/restart that environment setting. Keep database, Stripe keys, webhook route and maintenance working so existing sessions finish or expire safely. Do not disable the webhook as a rollback. Do not reset the database or restore an old backup over orders accepted after its snapshot.

For uncertain checkout creation, inspect the attempt/order and Stripe metadata in the Dashboard. Reuse the original request/idempotency key within its recorded retry window. If the window elapsed, locate the exact session/payment in the shared account by Good Apollo store/order metadata and resolve it through verified reconciliation. Do not create an independent second session. For late paid stock attention, gather physical availability; refund if fulfillment cannot be supported. Never pack a blocked order.

For ledger drift, disable new sales if counts cannot be trusted. Compare balances to the append-only movement sums and active reservations. Correct the root cause and apply an audited correction only after payment states are verified; no direct force-release endpoint exists. For failed refunds, review provider status and the same operation key. Monetary state does not prove a parcel returned. Disputes require manual evidence in Stripe before the recorded deadline.

## Limits and validation

Cart limits: 20 lines, 10 units per variant, 30 total units. Product limits: 100 variants, two options, 12 photos. Upload: 10 MB, JPEG/PNG/WebP, 36 million decoded pixels, three metadata-free WebP derivatives. Images are immutable in storage and served only after publication/auth checks, with public cache capped at five seconds so unpublishing propagates promptly. API bodies and persisted rate counters bound abuse. Runtime database pools are capped at five connections per instance.

The maintenance batch budget is 45 seconds plus the last bounded operation; Stripe uses an eight-second timeout and one network retry, and each SMTP operation has a ten-second socket timeout. Mail batches check the remaining deadline between sends. The Vercel adapter sets a 90-second function maximum. Verify real latency and the selected hosting entitlement in preview; deterministic local outage tests do not establish production load capacity.

Never log environment values, sign-in/status tokens, recovery codes, private upload URLs or shipping addresses. Keep `.env`, `.local`, Playwright auth artifacts, packing slips, exports and backups out of Git. Provider exceptions are converted to bounded public messages. Only deliberate development fixtures may contain invented addresses.

## Release and rollback

Apply migrations with the direct migration identity before promoting the application. Validate `npm ci`, migrations on an empty disposable DB, `npm test`, `npm run check`, both adapter builds, browser flows, protected preview, actual test-mode Stripe, mail, backup restore and monitoring. Record evidence in `docs/launch-checklist.md`. Confirm commercial hosting and service isolation, real photos/prices/counts, policies, sender DNS and operator readiness. Enable live checkout and discovery only in the actual approved production release, then perform non-charging public checks. After the first genuine customer order, compare payment, ledger, notifications and packing records.
