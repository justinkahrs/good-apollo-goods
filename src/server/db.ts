import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../../.generated/prisma/client';
import { config } from './config';
const globalDb = globalThis as unknown as { gagDb?: PrismaClient };
export function db() {
  if (!globalDb.gagDb) {
    const url = config().DATABASE_URL;
    if (!url) throw new Error('Database is not configured');
    globalDb.gagDb = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url, max: 5 }),
    });
  }
  return globalDb.gagDb;
}
export type Tx = Prisma.TransactionClient;
export { Prisma };
export async function atomic<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db().$transaction(fn, {
        isolationLevel: 'Serializable',
        timeout: 15000,
      });
    } catch (error) {
      const adapterCause =
        error instanceof Prisma.PrismaClientKnownRequestError
          ? (
              error.meta?.driverAdapterError as {
                cause?: { originalCode?: string };
              }
            )?.cause
          : undefined;
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (['P2034', 'P2002'].includes(error.code) ||
          (error.code === 'P2010' &&
            ['40001', '40P01'].includes(
              String(adapterCause?.originalCode ?? error.meta?.code),
            )));
      if (attempt >= 3 || !retryable) throw error;
    }
  }
}
