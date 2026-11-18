import type { DatabaseSync } from 'node:sqlite';
import { getDb, withImmediateTransaction } from '../db/connection.js';

/**
 * Libera todos los números pendientes cuyo tiempo límite (expires_at) ya venció.
 * También elimina registros de compradores que ya no tengan ningún número asociado
 * (conservando los datos únicamente mientras tengan números activos).
 */
export function releaseExpiredNumbers(db: DatabaseSync = getDb(), raffleId?: number): number {
  const nowIso = new Date().toISOString();

  return withImmediateTransaction(db, () => {
    const deleteStmt = raffleId !== undefined
      ? db.prepare(
          `DELETE FROM raffle_numbers
           WHERE raffle_id = ? AND status = 'pending' AND expires_at IS NOT NULL AND expires_at <= ?`
        )
      : db.prepare(
          `DELETE FROM raffle_numbers
           WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at <= ?`
        );

    const result = raffleId !== undefined
      ? deleteStmt.run(raffleId, nowIso)
      : deleteStmt.run(nowIso);

    const changes = Number(result.changes ?? 0);

    if (changes > 0) {
      if (raffleId !== undefined) {
        db.prepare(
          `DELETE FROM buyers
           WHERE raffle_id = ?
             AND NOT EXISTS (SELECT 1 FROM raffle_numbers rn WHERE rn.buyer_id = buyers.id)`
        ).run(raffleId);
      } else {
        db.prepare(
          `DELETE FROM buyers
           WHERE NOT EXISTS (SELECT 1 FROM raffle_numbers rn WHERE rn.buyer_id = buyers.id)`
        ).run();
      }
    }

    return changes;
  });
}
