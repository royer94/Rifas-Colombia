import { type DbAdapter, type DbExecutor, getDb } from '../db/connection.js';

export async function releaseExpiredNumbersWithinTx(
  tx: DbExecutor,
  raffleId?: number
): Promise<number> {
  const nowIso = new Date().toISOString();

  const result =
    raffleId !== undefined
      ? await tx.execute(
          `DELETE FROM raffle_numbers
           WHERE raffle_id = ? AND status = 'pending' AND expires_at IS NOT NULL AND expires_at <= ?`,
          [raffleId, nowIso]
        )
      : await tx.execute(
          `DELETE FROM raffle_numbers
           WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at <= ?`,
          [nowIso]
        );

  if (result.changes > 0) {
    if (raffleId !== undefined) {
      await tx.execute(
        `DELETE FROM buyers
         WHERE raffle_id = ?
           AND NOT EXISTS (SELECT 1 FROM raffle_numbers rn WHERE rn.buyer_id = buyers.id)`,
        [raffleId]
      );
    } else {
      await tx.execute(
        `DELETE FROM buyers
         WHERE NOT EXISTS (SELECT 1 FROM raffle_numbers rn WHERE rn.buyer_id = buyers.id)`
      );
    }
  }

  return result.changes;
}

/**
 * Libera todos los números pendientes cuyo tiempo límite (expires_at) ya venció.
 */
export async function releaseExpiredNumbers(
  db: DbAdapter = getDb(),
  raffleId?: number
): Promise<number> {
  return db.withTransaction((tx) => releaseExpiredNumbersWithinTx(tx, raffleId));
}
