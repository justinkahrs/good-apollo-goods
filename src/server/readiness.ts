import { db } from './db';
import { stockDrift } from './stock';
import { DomainError } from './domain';
export async function healthReport() {
  const [job, overdueHolds, failedMail, drift] = await Promise.all([
    db().maintenanceJob.findUnique({ where: { id: 'commerce' } }),
    db().checkoutAttempt.count({
      where: {
        status: {
          in: ['creating', 'uncertain', 'processing', 'open', 'attention'],
        },
        createdAt: { lt: new Date(Date.now() - 3600000) },
      },
    }),
    db().emailOutbox.count({
      where: { status: 'retry', attempts: { gte: 3 } },
    }),
    stockDrift(),
  ]);
  const maintenanceStale =
    !job?.lastSucceededAt ||
    Date.now() - job.lastSucceededAt.getTime() > 600000;
  return {
    ready: !maintenanceStale && !overdueHolds && !failedMail && !drift.length,
    maintenanceStale,
    overdueHolds,
    failedMail,
    drift,
    lastSucceededAt: job?.lastSucceededAt,
  };
}
export async function requireOperationalCheckout() {
  if (!(await healthReport()).ready)
    throw new DomainError(
      'Checkout is temporarily closed for a store check. Your cart is saved.',
      503,
      'closed',
    );
}
