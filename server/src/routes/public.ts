import { Router } from 'express';
import { getDb, withImmediateTransaction } from '../db/connection.js';
import { releaseExpiredNumbers } from '../services/expiration.js';
import { isValidTwoDigitNumber, normalizePhone, normalizeText } from '../utils/validation.js';

export const publicRouter = Router();

interface PublicRaffleRow {
  id: number;
  slug: string;
  name: string;
  description: string;
  draw_date: string;
  prize_text: string;
  lottery_name: string;
  ticket_price_cop: number;
  payment_instructions: string;
  release_hours: number;
  status: 'draft' | 'active' | 'closed';
  winning_number: string | null;
}

class ConflictError extends Error {
  takenNumbers: string[];
  constructor(message: string, takenNumbers: string[]) {
    super(message);
    this.takenNumbers = takenNumbers;
  }
}

class BadRequestError extends Error {}
class NotFoundError extends Error {}

publicRouter.get('/raffles', (_req, res) => {
  const db = getDb();
  releaseExpiredNumbers(db);

  const rows = db
    .prepare(
      `SELECT r.id, r.slug, r.name, r.description, r.draw_date, r.prize_text,
              r.lottery_name, r.ticket_price_cop, r.status, r.winning_number,
              SUM(CASE WHEN rn.status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
              SUM(CASE WHEN rn.status = 'paid' THEN 1 ELSE 0 END) AS paid_count
       FROM raffles r
       LEFT JOIN raffle_numbers rn ON rn.raffle_id = r.id
       WHERE r.status IN ('active', 'closed')
       GROUP BY r.id
       ORDER BY CASE WHEN r.status = 'active' THEN 0 ELSE 1 END, r.draw_date ASC, r.id DESC`
    )
    .all() as Array<{
    id: number;
    slug: string;
    name: string;
    description: string;
    draw_date: string;
    prize_text: string;
    lottery_name: string;
    ticket_price_cop: number;
    status: 'active' | 'closed';
    winning_number: string | null;
    pending_count: number;
    paid_count: number;
  }>;

  res.json({
    raffles: rows.map((r) => {
      const pending = Number(r.pending_count ?? 0);
      const paid = Number(r.paid_count ?? 0);
      return {
        id: r.id,
        slug: r.slug,
        name: r.name,
        description: r.description,
        drawDate: r.draw_date,
        prizeText: r.prize_text,
        lotteryName: r.lottery_name,
        ticketPriceCop: r.ticket_price_cop,
        status: r.status,
        winningNumber: r.winning_number,
        counts: {
          available: 100 - pending - paid,
          pending,
          paid,
        },
      };
    }),
  });
});

publicRouter.get('/raffles/:slug', (req, res) => {
  const slug = normalizeText(req.params.slug, 80).toLowerCase();
  if (!slug) {
    res.status(404).json({ error: 'Rifa no encontrada.' });
    return;
  }

  const db = getDb();
  const raffle = db
    .prepare(
      `SELECT id, slug, name, description, draw_date, prize_text, lottery_name,
              ticket_price_cop, payment_instructions, release_hours, status, winning_number
       FROM raffles
       WHERE slug = ? AND status != 'draft'`
    )
    .get(slug) as PublicRaffleRow | undefined;

  if (!raffle) {
    res.status(404).json({ error: 'No encontramos esta rifa o aún no está publicada.' });
    return;
  }

  releaseExpiredNumbers(db, raffle.id);

  const takenRows = db
    .prepare('SELECT number, status FROM raffle_numbers WHERE raffle_id = ?')
    .all(raffle.id) as Array<{ number: string; status: 'pending' | 'paid' }>;

  const statusByNumber = new Map<string, 'pending' | 'paid'>();
  let pendingCount = 0;
  let paidCount = 0;

  for (const row of takenRows) {
    statusByNumber.set(row.number, row.status);
    if (row.status === 'pending') pendingCount += 1;
    else paidCount += 1;
  }

  const numbers = Array.from({ length: 100 }, (_, i) => {
    const num = String(i).padStart(2, '0');
    return {
      number: num,
      status: statusByNumber.get(num) ?? 'available',
    };
  });

  let winnerName: string | null = null;
  let winnerStatus: 'paid' | 'pending' | 'unclaimed' | null = null;

  if (raffle.status === 'closed' && raffle.winning_number) {
    const winnerRow = db
      .prepare(
        `SELECT rn.status, b.full_name
         FROM raffle_numbers rn
         JOIN buyers b ON b.id = rn.buyer_id
         WHERE rn.raffle_id = ? AND rn.number = ?`
      )
      .get(raffle.id, raffle.winning_number) as
      | { status: 'pending' | 'paid'; full_name: string }
      | undefined;

    if (!winnerRow) {
      winnerStatus = 'unclaimed';
    } else if (winnerRow.status === 'paid') {
      winnerStatus = 'paid';
      winnerName = winnerRow.full_name;
    } else {
      winnerStatus = 'pending';
      winnerName = winnerRow.full_name;
    }
  }

  res.json({
    raffle: {
      id: raffle.id,
      slug: raffle.slug,
      name: raffle.name,
      description: raffle.description,
      drawDate: raffle.draw_date,
      prizeText: raffle.prize_text,
      lotteryName: raffle.lottery_name,
      ticketPriceCop: raffle.ticket_price_cop,
      paymentInstructions: raffle.payment_instructions,
      releaseHours: raffle.release_hours,
      status: raffle.status,
      winningNumber: raffle.winning_number,
      winnerName,
      winnerStatus,
    },
    numbers,
    counts: {
      available: 100 - pendingCount - paidCount,
      pending: pendingCount,
      paid: paidCount,
    },
    serverTime: new Date().toISOString(),
  });
});

publicRouter.post('/raffles/:slug/reserve', (req, res) => {
  const slug = normalizeText(req.params.slug, 80).toLowerCase();
  const rawNumbers: unknown[] = Array.isArray(req.body?.numbers) ? req.body.numbers : [];
  const fullName = normalizeText(req.body?.fullName, 100);
  const phone = normalizePhone(req.body?.phone);
  const address = normalizeText(req.body?.address, 200);

  if (!slug) {
    res.status(404).json({ error: 'Rifa no encontrada.' });
    return;
  }

  const uniqueNumbers: string[] = Array.from(
    new Set(rawNumbers.filter(isValidTwoDigitNumber))
  ).sort();

  if (uniqueNumbers.length === 0 || uniqueNumbers.length !== rawNumbers.length) {
    res.status(400).json({ error: 'Selecciona al menos un número válido entre 00 y 99.' });
    return;
  }

  if (fullName.length < 3) {
    res.status(400).json({ error: 'Ingresa tu nombre completo (mínimo 3 caracteres).' });
    return;
  }

  if (!phone) {
    res.status(400).json({
      error: 'Ingresa un número celular o WhatsApp colombiano válido de 10 dígitos (ej: 3001234567).',
    });
    return;
  }

  const db = getDb();

  try {
    const result = withImmediateTransaction(db, () => {
      const raffle = db
        .prepare(
          `SELECT id, slug, name, draw_date, prize_text, lottery_name,
                  ticket_price_cop, payment_instructions, release_hours, status
           FROM raffles
           WHERE slug = ?`
        )
        .get(slug) as
        | {
            id: number;
            slug: string;
            name: string;
            draw_date: string;
            prize_text: string;
            lottery_name: string;
            ticket_price_cop: number;
            payment_instructions: string;
            release_hours: number;
            status: 'draft' | 'active' | 'closed';
          }
        | undefined;

      if (!raffle || raffle.status === 'draft') {
        throw new NotFoundError('No encontramos esta rifa o aún no está publicada.');
      }

      if (raffle.status !== 'active') {
        throw new BadRequestError('Esta rifa ya está cerrada y no acepta más apartados.');
      }

      const now = new Date();
      const nowIso = now.toISOString();

      // Liberar vencidos atómicamente dentro de la misma transacción antes de validar
      const expired = db
        .prepare(
          `DELETE FROM raffle_numbers
           WHERE raffle_id = ? AND status = 'pending' AND expires_at IS NOT NULL AND expires_at <= ?`
        )
        .run(raffle.id, nowIso);
      if (Number(expired.changes ?? 0) > 0) {
        db.prepare(
          `DELETE FROM buyers
           WHERE raffle_id = ?
             AND NOT EXISTS (SELECT 1 FROM raffle_numbers rn WHERE rn.buyer_id = buyers.id)`
        ).run(raffle.id);
      }

      const placeholders = uniqueNumbers.map(() => '?').join(',');
      const alreadyTaken = db
        .prepare(
          `SELECT number FROM raffle_numbers
           WHERE raffle_id = ? AND number IN (${placeholders})
           ORDER BY number ASC`
        )
        .all(raffle.id, ...uniqueNumbers) as Array<{ number: string }>;

      if (alreadyTaken.length > 0) {
        const takenList = alreadyTaken.map((r) => r.number);
        const msg =
          takenList.length === 1
            ? `El número ${takenList[0]} ya fue tomado, elige otro.`
            : `Los números ${takenList.join(', ')} ya fueron tomados, elige otros.`;
        throw new ConflictError(msg, takenList);
      }

      const buyerInsert = db
        .prepare(
          `INSERT INTO buyers (raffle_id, full_name, phone, address, created_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(raffle.id, fullName, phone, address, nowIso);
      const buyerId = Number(buyerInsert.lastInsertRowid);

      const expiresAtIso = new Date(now.getTime() + raffle.release_hours * 60 * 60 * 1000).toISOString();
      const insertNumStmt = db.prepare(
        `INSERT INTO raffle_numbers (raffle_id, number, buyer_id, status, payment_method, reserved_at, expires_at, paid_at)
         VALUES (?, ?, ?, 'pending', '', ?, ?, NULL)`
      );

      for (const num of uniqueNumbers) {
        insertNumStmt.run(raffle.id, num, buyerId, nowIso, expiresAtIso);
      }

      return {
        reservation: {
          raffleName: raffle.name,
          raffleSlug: raffle.slug,
          drawDate: raffle.draw_date,
          prizeText: raffle.prize_text,
          lotteryName: raffle.lottery_name,
          numbers: uniqueNumbers,
          ticketPriceCop: raffle.ticket_price_cop,
          totalCop: uniqueNumbers.length * raffle.ticket_price_cop,
          releaseHours: raffle.release_hours,
          expiresAt: expiresAtIso,
          paymentInstructions: raffle.payment_instructions,
          buyerName: fullName,
          buyerPhone: phone,
        },
      };
    });

    res.status(201).json(result);
  } catch (err) {
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof BadRequestError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof ConflictError) {
      res.status(409).json({ error: err.message, takenNumbers: err.takenNumbers });
      return;
    }
    if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
      res.status(409).json({
        error: 'Uno de los números que elegiste acaba de ser tomado por otra persona. Elige otro.',
        takenNumbers: [],
      });
      return;
    }
    console.error('Error al reservar números:', err);
    res.status(500).json({ error: 'Ocurrió un error al apartar tus números. Intenta de nuevo.' });
  }
});
