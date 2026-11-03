import { z } from 'zod';
import { atomic, db, Prisma, type Tx } from './db';
import { DomainError } from './domain';
export async function lockStock(tx: Tx, ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  if (!sorted.length) return;
  await tx.$queryRaw(
    Prisma.sql`SELECT "variantId" FROM "StockBalance" WHERE "variantId" IN (${Prisma.join(sorted)}) ORDER BY "variantId" FOR UPDATE`,
  );
}
export async function movement(
  tx: Tx,
  input: {
    variantId: string;
    unsoldDelta: number;
    heldDelta: number;
    reason: string;
    operationKey: string;
    orderId?: string;
    actorId?: string;
  },
) {
  if (
    await tx.stockMovement.findUnique({
      where: { operationKey: input.operationKey },
    })
  )
    return;
  const balance = await tx.stockBalance.findUniqueOrThrow({
    where: { variantId: input.variantId },
  });
  const unsold = balance.unsoldQty + input.unsoldDelta;
  const held = balance.heldQty + input.heldDelta;
  if (unsold < 0 || held < 0 || held > unsold)
    throw new DomainError(
      'There is not enough available stock. Active checkout holds must remain protected.',
      409,
      'stock',
    );
  await tx.stockBalance.update({
    where: { variantId: input.variantId },
    data: { unsoldQty: unsold, heldQty: held, revision: { increment: 1 } },
  });
  await tx.stockMovement.create({ data: input });
}
export const adjustmentSchema = z.object({
  variantId: z.uuid(),
  operationKey: z.uuid(),
  revision: z.number().int().positive(),
  mode: z.enum(['add', 'remove', 'set']),
  quantity: z.number().int().min(0).max(100000),
  reason: z.string().trim().min(3).max(300),
});
export async function adjustStock(actorId: string, input: unknown) {
  const value = adjustmentSchema.parse(input);
  return atomic(async (tx) => {
    await lockStock(tx, [value.variantId]);
    const previous = await tx.stockMovement.findUnique({
      where: { operationKey: value.operationKey },
    });
    if (previous) {
      if (
        previous.variantId !== value.variantId ||
        previous.actorId !== actorId
      )
        throw new DomainError(
          'This operation belongs to another adjustment.',
          409,
        );
      return tx.stockBalance.findUniqueOrThrow({
        where: { variantId: value.variantId },
      });
    }
    const balance = await tx.stockBalance.findUniqueOrThrow({
      where: { variantId: value.variantId },
    });
    if (balance.revision !== value.revision)
      throw new DomainError(
        'Stock changed while this form was open. Refresh the count and review your adjustment.',
        409,
        'revision',
      );
    const delta =
      value.mode === 'set'
        ? value.quantity - balance.unsoldQty
        : value.mode === 'add'
          ? value.quantity
          : -value.quantity;
    await movement(tx, {
      variantId: value.variantId,
      unsoldDelta: delta,
      heldDelta: 0,
      reason: value.reason,
      operationKey: value.operationKey,
      actorId,
    });
    await tx.audit.create({
      data: {
        actorId,
        action: 'stock.adjust',
        entityId: value.variantId,
        metadata: {
          mode: value.mode,
          quantity: value.quantity,
          delta,
          reason: value.reason,
        },
      },
    });
    return tx.stockBalance.findUniqueOrThrow({
      where: { variantId: value.variantId },
    });
  });
}
export async function settleStock(
  tx: Tx,
  orderId: string,
  action: 'consume' | 'release',
) {
  const rows = await tx.reservation.findMany({
    where: { orderId },
    orderBy: { variantId: 'asc' },
  });
  await lockStock(
    tx,
    rows.map((r) => r.variantId),
  );
  if (action === 'consume' && rows.some((r) => r.state === 'released')) {
    const balances = await tx.stockBalance.findMany({
      where: {
        variantId: {
          in: rows
            .filter((r) => r.state === 'released')
            .map((r) => r.variantId),
        },
      },
    });
    if (
      rows.some(
        (r) =>
          r.state === 'released' &&
          balances.find((b) => b.variantId === r.variantId)!.unsoldQty -
            balances.find((b) => b.variantId === r.variantId)!.heldQty <
            r.quantity,
      )
    )
      return false;
  }
  for (const row of rows) {
    if (
      row.state === 'consumed' ||
      (action === 'release' && row.state === 'released')
    )
      continue;
    await movement(tx, {
      variantId: row.variantId,
      unsoldDelta: action === 'consume' ? -row.quantity : 0,
      heldDelta: row.state === 'held' ? -row.quantity : 0,
      reason: `checkout.${action}`,
      operationKey: `${action}:${row.id}`,
      orderId,
    });
    await tx.reservation.update({
      where: { id: row.id },
      data: { state: action === 'consume' ? 'consumed' : 'released' },
    });
  }
  return true;
}
export async function stockDrift() {
  const rows = await db().$queryRaw<
    Array<{
      variantId: string;
      unsoldQty: number;
      heldQty: number;
      ledgerUnsold: bigint;
      ledgerHeld: bigint;
      reserved: bigint;
    }>
  >(Prisma.sql`
    SELECT b."variantId", b."unsoldQty", b."heldQty", COALESCE(m.u,0)::bigint AS "ledgerUnsold", COALESCE(m.h,0)::bigint AS "ledgerHeld", COALESCE(r.q,0)::bigint AS reserved
    FROM "StockBalance" b LEFT JOIN (SELECT "variantId",SUM("unsoldDelta") u,SUM("heldDelta") h FROM "StockMovement" GROUP BY "variantId") m ON m."variantId"=b."variantId"
    LEFT JOIN (SELECT "variantId", SUM(quantity) q FROM "Reservation" WHERE state='held' GROUP BY "variantId") r ON r."variantId"=b."variantId"`);
  return rows
    .filter(
      (r) =>
        r.unsoldQty !== Number(r.ledgerUnsold) ||
        r.heldQty !== Number(r.ledgerHeld) ||
        r.heldQty !== Number(r.reserved),
    )
    .map((r) => ({
      variantId: r.variantId,
      unsold: r.unsoldQty,
      held: r.heldQty,
      ledgerUnsold: Number(r.ledgerUnsold),
      ledgerHeld: Number(r.ledgerHeld),
      reserved: Number(r.reserved),
    }));
}
