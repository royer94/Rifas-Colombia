import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { releaseExpiredNumbers, releaseExpiredNumbersWithinTx } from '../services/expiration.js';
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

function isUniqueConstraintError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const pgCode = (err as { code?: string }).code;
  if (pgCode === '23505') return true;
  if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) return true;
  return false;
}

publicRouter.get('/raffles', async (_req, res, next) => {
  try {
    const db = getDb();
    await releaseExpiredNumbers(db);

    const rows = await db.query<{
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
      pending_count: number | string;
      paid_count: number | string;
    }>(
      `SELECT r.id, r.slug, r.name, r.description, r.draw_date, r.prize_text,
              r.lottery_name, r.ticket_price_cop, r.status, r.winning_number,
              SUM(CASE WHEN rn.status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
              SUM(CASE WHEN rn.status = 'paid' THEN 1 ELSE 0 END) AS paid_count
       FROM raffles r
       LEFT JOIN raffle_numbers rn ON rn.raffle_id = r.id
       WHERE r.status IN ('active', 'closed')
       GROUP BY r.id
       ORDER BY CASE WHEN r.status = 'active' THEN 0 ELSE 1 END, r.draw_date ASC, r.id DESC`
    );

    res.json({
      raffles: rows.map((r) => {
        const pending = Number(r.pending_count ?? 0);
        const paid = Number(r.paid_count ?? 0);
        return {
          id: Number(r.id),
          slug: r.slug,
          name: r.name,
          description: r.description,
          drawDate: r.draw_date,
          prizeText: r.prize_text,
          lotteryName: r.lottery_name,
          ticketPriceCop: Number(r.ticket_price_cop),
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
  } catch (err) {
    next(err);
  }
});

publicRouter.get('/raffles/:slug', async (req, res, next) => {
  try {
    const slug = normalizeText(req.params.slug, 80).toLowerCase();
    if (!slug) {
      res.status(404).json({ error: 'Rifa no encontrada.' });
      return;
    }

    const db = getDb();
    const raffle = await db.queryOne<PublicRaffleRow>(
      `SELECT id, slug, name, description, draw_date, prize_text, lottery_name,
              ticket_price_cop, payment_instructions, release_hours, status, winning_number
       FROM raffles
       WHERE slug = ? AND status != 'draft'`,
      [slug]
    );

    if (!raffle) {
      res.status(404).json({ error: 'No encontramos esta rifa o aún no está publicada.' });
      return;
    }

    const raffleId = Number(raffle.id);
    await releaseExpiredNumbers(db, raffleId);

    const takenRows = await db.query<{ number: string; status: 'pending' | 'paid' }>(
      'SELECT number, status FROM raffle_numbers WHERE raffle_id = ?',
      [raffleId]
    );

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
      const winnerRow = await db.queryOne<{ status: 'pending' | 'paid'; full_name: string }>(
        `SELECT rn.status, b.full_name
         FROM raffle_numbers rn
         JOIN buyers b ON b.id = rn.buyer_id
         WHERE rn.raffle_id = ? AND rn.number = ?`,
        [raffleId, raffle.winning_number]
      );

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
        id: raffleId,
        slug: raffle.slug,
        name: raffle.name,
        description: raffle.description,
        drawDate: raffle.draw_date,
        prizeText: raffle.prize_text,
        lotteryName: raffle.lottery_name,
        ticketPriceCop: Number(raffle.ticket_price_cop),
        paymentInstructions: raffle.payment_instructions,
        releaseHours: Number(raffle.release_hours),
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
  } catch (err) {
    next(err);
  }
});

publicRouter.post('/raffles/:slug/reserve', async (req, res) => {
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
      error:
        'Ingresa un número celular o WhatsApp colombiano válido de 10 dígitos (ej: 3001234567).',
    });
    return;
  }

  const db = getDb();

  try {
    const result = await db.withTransaction(async (tx) => {
      const lockSuffix = tx.dialect === 'postgres' ? ' FOR UPDATE' : '';
      const raffle = await tx.queryOne<{
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
      }>(
        `SELECT id, slug, name, draw_date, prize_text, lottery_name,
                ticket_price_cop, payment_instructions, release_hours, status
         FROM raffles
         WHERE slug = ?${lockSuffix}`,
        [slug]
      );

      if (!raffle || raffle.status === 'draft') {
        throw new NotFoundError('No encontramos esta rifa o aún no está publicada.');
      }

      if (raffle.status !== 'active') {
        throw new BadRequestError('Esta rifa ya está cerrada y no acepta más apartados.');
      }

      const raffleId = Number(raffle.id);
      const releaseHours = Number(raffle.release_hours);
      const ticketPriceCop = Number(raffle.ticket_price_cop);
      const now = new Date();
      const nowIso = now.toISOString();

      await releaseExpiredNumbersWithinTx(tx, raffleId);

      const placeholders = uniqueNumbers.map(() => '?').join(',');
      const alreadyTaken = await tx.query<{ number: string }>(
        `SELECT number FROM raffle_numbers
         WHERE raffle_id = ? AND number IN (${placeholders})
         ORDER BY number ASC`,
        [raffleId, ...uniqueNumbers]
      );

      if (alreadyTaken.length > 0) {
        const takenList = alreadyTaken.map((r) => r.number);
        const msg =
          takenList.length === 1
            ? `El número ${takenList[0]} ya fue tomado, elige otro.`
            : `Los números ${takenList.join(', ')} ya fueron tomados, elige otros.`;
        throw new ConflictError(msg, takenList);
      }

      const buyerId = await tx.insertReturningId(
        `INSERT INTO buyers (raffle_id, full_name, phone, address, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [raffleId, fullName, phone, address, nowIso]
      );

      const expiresAtIso = new Date(now.getTime() + releaseHours * 60 * 60 * 1000).toISOString();
      for (const num of uniqueNumbers) {
        await tx.execute(
          `INSERT INTO raffle_numbers (raffle_id, number, buyer_id, status, payment_method, reserved_at, expires_at, paid_at)
           VALUES (?, ?, ?, 'pending', '', ?, ?, NULL)`,
          [raffleId, num, buyerId, nowIso, expiresAtIso]
        );
      }

      return {
        reservation: {
          raffleName: raffle.name,
          raffleSlug: raffle.slug,
          drawDate: raffle.draw_date,
          prizeText: raffle.prize_text,
          lotteryName: raffle.lottery_name,
          numbers: uniqueNumbers,
          ticketPriceCop,
          totalCop: uniqueNumbers.length * ticketPriceCop,
          releaseHours,
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
    if (isUniqueConstraintError(err)) {
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
