import { db } from './db';
import { createSession, reconcileSession } from './payments';
import { performRefund } from './orders';
import { processEvent } from './events';
import { deliverOutbox, enqueue } from './email';
import { healthReport } from './readiness';
export { healthReport } from './readiness';
export async function monitor() {
  const health = await healthReport();
  const warnings = [
    health.maintenanceStale
      ? 'Maintenance has missed two scheduled intervals'
      : null,
    health.overdueHolds ? 'Checkout holds older than one hour' : null,
    health.failedMail ? 'Email delivery has repeatedly failed' : null,
    health.drift.length ? 'Stock ledger drift detected' : null,
  ].filter(Boolean);
  for (const reason of warnings)
    await enqueue(
      db(),
      `health:${reason}:${Math.floor(Date.now() / 3600000)}`,
      'alert',
      { reason },
    );
  return { ready: health.ready, warnings: warnings.length };
}
export async function maintenance() {
  await db().maintenanceJob.upsert({
    where: { id: 'commerce' },
    create: {},
    update: {},
  });
  const claim = await db().maintenanceJob.updateMany({
    where: {
      id: 'commerce',
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
    },
    data: {
      leaseUntil: new Date(Date.now() + 240000),
      lastStartedAt: new Date(),
    },
  });
  if (!claim.count) return { busy: true };
  const deadline = Date.now() + 45000;
  let failures = 0;
  try {
    const attempts = await db().checkoutAttempt.findMany({
      where: {
        status: {
          in: ['creating', 'uncertain', 'open', 'processing', 'attention'],
        },
      },
      orderBy: { updatedAt: 'asc' },
      take: 20,
    });
    for (const a of attempts) {
      if (Date.now() > deadline) break;
      try {
        if (a.sessionId) await reconcileSession(a.sessionId);
        else await createSession(a.id);
      } catch {
        failures++;
        await db().checkoutAttempt.update({
          where: { id: a.id },
          data: {
            failures: { increment: 1 },
            lastError: 'provider_reconciliation_retry',
          },
        });
      }
    }
    const events = await db().stripeEvent.findMany({
      where: { status: { not: 'complete' } },
      orderBy: [{ attempts: 'asc' }, { createdAt: 'asc' }],
      take: 10,
    });
    for (const e of events) {
      if (Date.now() > deadline) break;
      try {
        await processEvent(e.id);
      } catch {
        failures++;
      }
    }
    const refunds = await db().refund.findMany({
      where: { status: { in: ['requested', 'pending'] }, stripeId: null },
      orderBy: { updatedAt: 'asc' },
      take: 5,
    });
    for (const r of refunds) {
      if (Date.now() > deadline) break;
      try {
        await performRefund(r.id);
      } catch {
        failures++;
      }
    }
    await monitor();
    const mail =
      Date.now() < deadline
        ? await deliverOutbox(5, undefined, deadline)
        : { delivered: 0, failed: 0 };
    await db().requestLimit.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    await db().adminStepUp.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    await db().maintenanceJob.update({
      where: { id: 'commerce' },
      data: {
        leaseUntil: null,
        lastSucceededAt: new Date(),
        lastError: failures ? 'some_provider_work_retrying' : null,
      },
    });
    return { processed: attempts.length, failures, ...mail };
  } catch {
    await db().maintenanceJob.update({
      where: { id: 'commerce' },
      data: { leaseUntil: null, lastError: 'maintenance_failed' },
    });
    throw new Error('maintenance_failed');
  }
}
