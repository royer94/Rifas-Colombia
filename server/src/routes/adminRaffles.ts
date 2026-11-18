import { Router } from 'express';
import { getDb, withImmediateTransaction } from '../db/connection.js';
import { requireAdmin } from '../middleware/auth.js';
import { releaseExpiredNumbers } from '../services/expiration.js';
import {
  csvEscape,
  isValidDateYmd,
  isValidTwoDigitNumber,
  normalizePhone,
  normalizeText,
  slugify,
} from '../utils/validation.js';

export const adminRafflesRouter = Router();

adminRafflesRouter.use(requireAdmin);

interface RaffleDbRow {
  id: number;
  admin_id: number;
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
  created_at: string;
  updated_at: string;
}

function getOwnedRaffle(raffleId: number, adminId: number): RaffleDbRow | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM raffles WHERE id = ? AND admin_id = ?')
    .get(raffleId, adminId) as RaffleDbRow | undefined;
  return row ?? null;
}

function parseRafflePayload(body: Record<string, unknown>) {
  const name = normalizeText(body?.name, 120);
  const description = normalizeText(body?.description, 2000);
  const drawDate = normalizeText(body?.drawDate, 10);
  const prizeText = normalizeText(body?.prizeText, 300);
  const lotteryName = normalizeText(body?.lotteryName, 100);
  const ticketPriceCop = Number(body?.ticketPriceCop);
  const paymentInstructions = normalizeText(body?.paymentInstructions, 2000);
  const releaseHours = body?.releaseHours === undefined ? 24 : Number(body.releaseHours);
  const status = typeof body?.status === 'string' ? body.status : 'active';
  const rawSlug = typeof body?.slug === 'string' ? slugify(body.slug) : '';

  if (name.length < 3) {
    return { error: 'El nombre de la rifa debe tener al menos 3 caracteres.' };
  }
  if (!isValidDateYmd(drawDate)) {
    return { error: 'Selecciona una fecha de sorteo válida.' };
  }
  if (prizeText.length < 2) {
    return { error: 'Escribe el premio de la rifa.' };
  }
  if (lotteryName.length < 2) {
    return { error: 'Selecciona o escribe el nombre de la lotería.' };
  }
  if (!Number.isInteger(ticketPriceCop) || ticketPriceCop < 1000 || ticketPriceCop > 50_000_000) {
    return { error: 'El valor por número debe ser un número entero desde $1.000 COP.' };
  }
  if (paymentInstructions.length < 5) {
    return { error: 'Escribe las instrucciones de pago (Nequi, Daviplata, cuenta, llave, etc.).' };
  }
  if (!Number.isInteger(releaseHours) || releaseHours < 1 || releaseHours > 720) {
    return { error: 'Las horas para liberar números deben estar entre 1 y 720.' };
  }
  if (!['draft', 'active', 'closed'].includes(status)) {
    return { error: 'Estado de rifa inválido.' };
  }

  return {
    data: {
      name,
      description,
      drawDate,
      prizeText,
      lotteryName,
      ticketPriceCop,
      paymentInstructions,
      releaseHours,
      status: status as 'draft' | 'active' | 'closed',
      customSlug: rawSlug,
    },
  };
}

function generateUniqueSlug(baseName: string, excludeRaffleId?: number): string {
  const db = getDb();
  const base = slugify(baseName) || 'rifa';
  let candidate = base;
  let counter = 2;

  while (true) {
    const existing = excludeRaffleId
      ? db.prepare('SELECT id FROM raffles WHERE slug = ? AND id != ?').get(candidate, excludeRaffleId)
      : db.prepare('SELECT id FROM raffles WHERE slug = ?').get(candidate);
    if (!existing) return candidate;
    candidate = `${base}-${counter}`;
    counter += 1;
  }
}

adminRafflesRouter.get('/', (req, res) => {
  const db = getDb();
  releaseExpiredNumbers(db);

  const rows = db
    .prepare(
      `SELECT r.*,
              SUM(CASE WHEN rn.status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
              SUM(CASE WHEN rn.status = 'paid' THEN 1 ELSE 0 END) AS paid_count
       FROM raffles r
       LEFT JOIN raffle_numbers rn ON rn.raffle_id = r.id
       WHERE r.admin_id = ?
       GROUP BY r.id
       ORDER BY r.created_at DESC, r.id DESC`
    )
    .all(req.admin!.id) as unknown as Array<
    RaffleDbRow & { pending_count: number; paid_count: number }
  >;

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
        paymentInstructions: r.payment_instructions,
        releaseHours: r.release_hours,
        status: r.status,
        winningNumber: r.winning_number,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        counts: {
          available: 100 - pending - paid,
          pending,
          paid,
        },
        totalCollectedCop: paid * r.ticket_price_cop,
        pendingAmountCop: pending * r.ticket_price_cop,
      };
    }),
  });
});

adminRafflesRouter.post('/', (req, res) => {
  const parsed = parseRafflePayload(req.body ?? {});
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const db = getDb();
  const data = parsed.data;
  let slug = data.customSlug;

  if (slug) {
    const exists = db.prepare('SELECT id FROM raffles WHERE slug = ?').get(slug);
    if (exists) {
      res.status(409).json({ error: `El enlace "/r/${slug}" ya está ocupado por otra rifa.` });
      return;
    }
  } else {
    slug = generateUniqueSlug(data.name);
  }

  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO raffles (
         admin_id, slug, name, description, draw_date, prize_text, lottery_name,
         ticket_price_cop, payment_instructions, release_hours, status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.admin!.id,
      slug,
      data.name,
      data.description,
      data.drawDate,
      data.prizeText,
      data.lotteryName,
      data.ticketPriceCop,
      data.paymentInstructions,
      data.releaseHours,
      data.status,
      now,
      now
    );

  const created = getOwnedRaffle(Number(info.lastInsertRowid), req.admin!.id)!;
  res.status(201).json({
    raffle: {
      id: created.id,
      slug: created.slug,
      name: created.name,
      description: created.description,
      drawDate: created.draw_date,
      prizeText: created.prize_text,
      lotteryName: created.lottery_name,
      ticketPriceCop: created.ticket_price_cop,
      paymentInstructions: created.payment_instructions,
      releaseHours: created.release_hours,
      status: created.status,
      winningNumber: created.winning_number,
    },
  });
});

adminRafflesRouter.put('/:id', (req, res) => {
  const raffleId = Number(req.params.id);
  const existing = getOwnedRaffle(raffleId, req.admin!.id);
  if (!existing) {
    res.status(404).json({ error: 'Rifa no encontrada.' });
    return;
  }

  const parsed = parseRafflePayload(req.body ?? {});
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const db = getDb();
  const data = parsed.data;
  const nextSlug = data.customSlug || existing.slug;

  if (nextSlug !== existing.slug) {
    const slugConflict = db
      .prepare('SELECT id FROM raffles WHERE slug = ? AND id != ?')
      .get(nextSlug, raffleId);
    if (slugConflict) {
      res.status(409).json({ error: `El enlace "/r/${nextSlug}" ya está ocupado por otra rifa.` });
      return;
    }
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE raffles
     SET slug = ?, name = ?, description = ?, draw_date = ?, prize_text = ?,
         lottery_name = ?, ticket_price_cop = ?, payment_instructions = ?,
         release_hours = ?, status = ?, updated_at = ?
     WHERE id = ? AND admin_id = ?`
  ).run(
    nextSlug,
    data.name,
    data.description,
    data.drawDate,
    data.prizeText,
    data.lotteryName,
    data.ticketPriceCop,
    data.paymentInstructions,
    data.releaseHours,
    data.status,
    now,
    raffleId,
    req.admin!.id
  );

  const updated = getOwnedRaffle(raffleId, req.admin!.id)!;
  res.json({
    raffle: {
      id: updated.id,
      slug: updated.slug,
      name: updated.name,
      description: updated.description,
      drawDate: updated.draw_date,
      prizeText: updated.prize_text,
      lotteryName: updated.lottery_name,
      ticketPriceCop: updated.ticket_price_cop,
      paymentInstructions: updated.payment_instructions,
      releaseHours: updated.release_hours,
      status: updated.status,
      winningNumber: updated.winning_number,
    },
  });
});

adminRafflesRouter.delete('/:id', (req, res) => {
  const raffleId = Number(req.params.id);
  const existing = getOwnedRaffle(raffleId, req.admin!.id);
  if (!existing) {
    res.status(404).json({ error: 'Rifa no encontrada.' });
    return;
  }

  const db = getDb();
  db.prepare('DELETE FROM raffles WHERE id = ? AND admin_id = ?').run(raffleId, req.admin!.id);
  res.json({ ok: true });
});

adminRafflesRouter.get('/:id', (req, res) => {
  const raffleId = Number(req.params.id);
  const raffle = getOwnedRaffle(raffleId, req.admin!.id);
  if (!raffle) {
    res.status(404).json({ error: 'Rifa no encontrada.' });
    return;
  }

  const db = getDb();
  releaseExpiredNumbers(db, raffleId);

  const rows = db
    .prepare(
      `SELECT rn.number, rn.status, rn.payment_method, rn.reserved_at, rn.expires_at, rn.paid_at,
              b.id AS buyer_id, b.full_name, b.phone, b.address, b.created_at AS buyer_created_at
       FROM raffle_numbers rn
       JOIN buyers b ON b.id = rn.buyer_id
       WHERE rn.raffle_id = ?
       ORDER BY rn.number ASC`
    )
    .all(raffleId) as Array<{
    number: string;
    status: 'pending' | 'paid';
    payment_method: string;
    reserved_at: string;
    expires_at: string | null;
    paid_at: string | null;
    buyer_id: number;
    full_name: string;
    phone: string;
    address: string;
    buyer_created_at: string;
  }>;

  const byNumber = new Map<string, (typeof rows)[number]>();
  const buyersMap = new Map<
    number,
    {
      buyerId: number;
      fullName: string;
      phone: string;
      address: string;
      numbers: string[];
      pendingNumbers: string[];
      paidNumbers: string[];
      totalCop: number;
      status: 'pending' | 'paid' | 'mixed';
      paymentMethods: string[];
      createdAt: string;
      earliestExpiresAt: string | null;
    }
  >();

  let pendingCount = 0;
  let paidCount = 0;

  for (const row of rows) {
    byNumber.set(row.number, row);
    if (row.status === 'pending') pendingCount += 1;
    else paidCount += 1;

    let entry = buyersMap.get(row.buyer_id);
    if (!entry) {
      entry = {
        buyerId: row.buyer_id,
        fullName: row.full_name,
        phone: row.phone,
        address: row.address,
        numbers: [],
        pendingNumbers: [],
        paidNumbers: [],
        totalCop: 0,
        status: 'pending',
        paymentMethods: [],
        createdAt: row.buyer_created_at,
        earliestExpiresAt: null,
      };
      buyersMap.set(row.buyer_id, entry);
    }

    entry.numbers.push(row.number);
    entry.totalCop += raffle.ticket_price_cop;
    if (row.status === 'pending') {
      entry.pendingNumbers.push(row.number);
      if (row.expires_at && (!entry.earliestExpiresAt || row.expires_at < entry.earliestExpiresAt)) {
        entry.earliestExpiresAt = row.expires_at;
      }
    } else {
      entry.paidNumbers.push(row.number);
    }
    if (row.payment_method && !entry.paymentMethods.includes(row.payment_method)) {
      entry.paymentMethods.push(row.payment_method);
    }
  }

  for (const entry of buyersMap.values()) {
    if (entry.pendingNumbers.length === 0) entry.status = 'paid';
    else if (entry.paidNumbers.length === 0) entry.status = 'pending';
    else entry.status = 'mixed';
  }

  const numbers = Array.from({ length: 100 }, (_, i) => {
    const num = String(i).padStart(2, '0');
    const hit = byNumber.get(num);
    if (!hit) {
      return {
        number: num,
        status: 'available' as const,
        buyer: null,
      };
    }
    return {
      number: num,
      status: hit.status,
      paymentMethod: hit.payment_method,
      reservedAt: hit.reserved_at,
      expiresAt: hit.expires_at,
      paidAt: hit.paid_at,
      buyer: {
        buyerId: hit.buyer_id,
        fullName: hit.full_name,
        phone: hit.phone,
        address: hit.address,
      },
    };
  });

  const participants = Array.from(buyersMap.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

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
      createdAt: raffle.created_at,
      updatedAt: raffle.updated_at,
    },
    counts: {
      available: 100 - pendingCount - paidCount,
      pending: pendingCount,
      paid: paidCount,
      totalCollectedCop: paidCount * raffle.ticket_price_cop,
      pendingAmountCop: pendingCount * raffle.ticket_price_cop,
    },
    numbers,
    participants,
  });
});

adminRafflesRouter.post('/:id/numbers/:number/confirm', (req, res) => {
  const raffleId = Number(req.params.id);
  const number = req.params.number;
  if (!isValidTwoDigitNumber(number)) {
    res.status(400).json({ error: 'Número inválido.' });
    return;
  }

  const raffle = getOwnedRaffle(raffleId, req.admin!.id);
  if (!raffle) {
    res.status(404).json({ error: 'Rifa no encontrada.' });
    return;
  }

  const paymentMethod = normalizeText(req.body?.paymentMethod, 50);
  const db = getDb();
  releaseExpiredNumbers(db, raffleId);

  const row = db
    .prepare(
      `SELECT rn.status, b.id AS buyer_id, b.full_name, b.phone
       FROM raffle_numbers rn
       JOIN buyers b ON b.id = rn.buyer_id
       WHERE rn.raffle_id = ? AND rn.number = ?`
    )
    .get(raffleId, number) as
    | { status: 'pending' | 'paid'; buyer_id: number; full_name: string; phone: string }
    | undefined;

  if (!row) {
    res.status(404).json({ error: `El número ${number} está disponible (no tiene comprador apartado).` });
    return;
  }

  const paidAt = new Date().toISOString();
  db.prepare(
    `UPDATE raffle_numbers
     SET status = 'paid', expires_at = NULL, paid_at = ?, payment_method = CASE WHEN ? != '' THEN ? ELSE payment_method END
     WHERE raffle_id = ? AND number = ?`
  ).run(paidAt, paymentMethod, paymentMethod, raffleId, number);

  res.json({
    ok: true,
    confirmed: {
      number,
      buyerName: row.full_name,
      buyerPhone: row.phone,
    },
  });
});

adminRafflesRouter.post('/:id/numbers/:number/release', (req, res) => {
  const raffleId = Number(req.params.id);
  const number = req.params.number;
  if (!isValidTwoDigitNumber(number)) {
    res.status(400).json({ error: 'Número inválido.' });
    return;
  }

  const raffle = getOwnedRaffle(raffleId, req.admin!.id);
  if (!raffle) {
    res.status(404).json({ error: 'Rifa no encontrada.' });
    return;
  }

  const db = getDb();
  withImmediateTransaction(db, () => {
    db.prepare('DELETE FROM raffle_numbers WHERE raffle_id = ? AND number = ?').run(raffleId, number);
    db.prepare(
      `DELETE FROM buyers
       WHERE raffle_id = ?
         AND NOT EXISTS (SELECT 1 FROM raffle_numbers rn WHERE rn.buyer_id = buyers.id)`
    ).run(raffleId);
  });

  res.json({ ok: true });
});

adminRafflesRouter.post('/:id/numbers/:number/reassign', (req, res) => {
  const raffleId = Number(req.params.id);
  const number = req.params.number;
  if (!isValidTwoDigitNumber(number)) {
    res.status(400).json({ error: 'Número inválido.' });
    return;
  }

  const raffle = getOwnedRaffle(raffleId, req.admin!.id);
  if (!raffle) {
    res.status(404).json({ error: 'Rifa no encontrada.' });
    return;
  }

  const fullName = normalizeText(req.body?.fullName, 100);
  const phone = normalizePhone(req.body?.phone);
  const address = normalizeText(req.body?.address, 200);
  const markPaid = Boolean(req.body?.markPaid);
  const paymentMethod = normalizeText(req.body?.paymentMethod, 50);

  if (fullName.length < 3) {
    res.status(400).json({ error: 'Ingresa el nombre completo del nuevo comprador.' });
    return;
  }
  if (!phone) {
    res.status(400).json({ error: 'Ingresa un celular colombiano válido de 10 dígitos (ej: 3001234567).' });
    return;
  }

  const db = getDb();
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAtIso = markPaid
    ? null
    : new Date(now.getTime() + raffle.release_hours * 60 * 60 * 1000).toISOString();

  withImmediateTransaction(db, () => {
    const existingNum = db
      .prepare('SELECT id FROM raffle_numbers WHERE raffle_id = ? AND number = ?')
      .get(raffleId, number);

    const buyerInsert = db
      .prepare(
        `INSERT INTO buyers (raffle_id, full_name, phone, address, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(raffleId, fullName, phone, address, nowIso);
    const buyerId = Number(buyerInsert.lastInsertRowid);

    if (existingNum) {
      db.prepare(
        `UPDATE raffle_numbers
         SET buyer_id = ?, status = ?, payment_method = ?, reserved_at = ?, expires_at = ?, paid_at = ?
         WHERE raffle_id = ? AND number = ?`
      ).run(
        buyerId,
        markPaid ? 'paid' : 'pending',
        paymentMethod,
        nowIso,
        expiresAtIso,
        markPaid ? nowIso : null,
        raffleId,
        number
      );

      db.prepare(
        `DELETE FROM buyers
         WHERE raffle_id = ?
           AND NOT EXISTS (SELECT 1 FROM raffle_numbers rn WHERE rn.buyer_id = buyers.id)`
      ).run(raffleId);
    } else {
      db.prepare(
        `INSERT INTO raffle_numbers (raffle_id, number, buyer_id, status, payment_method, reserved_at, expires_at, paid_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        raffleId,
        number,
        buyerId,
        markPaid ? 'paid' : 'pending',
        paymentMethod,
        nowIso,
        expiresAtIso,
        markPaid ? nowIso : null
      );
    }
  });

  res.json({
    ok: true,
    assigned: {
      number,
      fullName,
      phone,
      status: markPaid ? 'paid' : 'pending',
    },
  });
});

adminRafflesRouter.post('/:id/numbers/assign', (req, res) => {
  const raffleId = Number(req.params.id);
  const raffle = getOwnedRaffle(raffleId, req.admin!.id);
  if (!raffle) {
    res.status(404).json({ error: 'Rifa no encontrada.' });
    return;
  }

  const rawNumbers: unknown[] = Array.isArray(req.body?.numbers) ? req.body.numbers : [];
  const numbers: string[] = Array.from(
    new Set(rawNumbers.filter(isValidTwoDigitNumber))
  ).sort();
  const fullName = normalizeText(req.body?.fullName, 100);
  const phone = normalizePhone(req.body?.phone);
  const address = normalizeText(req.body?.address, 200);
  const markPaid = req.body?.markPaid !== false; // por defecto venta directa pagada
  const paymentMethod = normalizeText(req.body?.paymentMethod, 50) || (markPaid ? 'Efectivo' : '');

  if (numbers.length === 0) {
    res.status(400).json({ error: 'Selecciona al menos un número válido entre 00 y 99.' });
    return;
  }
  if (fullName.length < 3) {
    res.status(400).json({ error: 'Ingresa el nombre completo del comprador.' });
    return;
  }
  if (!phone) {
    res.status(400).json({ error: 'Ingresa un celular colombiano válido de 10 dígitos (ej: 3001234567).' });
    return;
  }

  const db = getDb();
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAtIso = markPaid
    ? null
    : new Date(now.getTime() + raffle.release_hours * 60 * 60 * 1000).toISOString();

  try {
    withImmediateTransaction(db, () => {
      db.prepare(
        `DELETE FROM raffle_numbers
         WHERE raffle_id = ? AND status = 'pending' AND expires_at IS NOT NULL AND expires_at <= ?`
      ).run(raffleId, nowIso);

      const placeholders = numbers.map(() => '?').join(',');
      const taken = db
        .prepare(
          `SELECT number FROM raffle_numbers WHERE raffle_id = ? AND number IN (${placeholders}) ORDER BY number`
        )
        .all(raffleId, ...numbers) as Array<{ number: string }>;

      if (taken.length > 0) {
        throw new Error(`TAKEN:${taken.map((t) => t.number).join(', ')}`);
      }

      const buyerInsert = db
        .prepare(
          `INSERT INTO buyers (raffle_id, full_name, phone, address, created_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(raffleId, fullName, phone, address, nowIso);
      const buyerId = Number(buyerInsert.lastInsertRowid);

      const insertStmt = db.prepare(
        `INSERT INTO raffle_numbers (raffle_id, number, buyer_id, status, payment_method, reserved_at, expires_at, paid_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const num of numbers) {
        insertStmt.run(
          raffleId,
          num,
          buyerId,
          markPaid ? 'paid' : 'pending',
          paymentMethod,
          nowIso,
          expiresAtIso,
          markPaid ? nowIso : null
        );
      }
    });

    res.status(201).json({
      ok: true,
      assigned: {
        numbers,
        fullName,
        phone,
        status: markPaid ? 'paid' : 'pending',
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('TAKEN:')) {
      const takenList = err.message.slice(6);
      res.status(409).json({
        error: `Los siguientes números ya no están disponibles: ${takenList}.`,
      });
      return;
    }
    throw err;
  }
});

adminRafflesRouter.post('/:id/buyers/:buyerId/confirm-all', (req, res) => {
  const raffleId = Number(req.params.id);
  const buyerId = Number(req.params.buyerId);
  const raffle = getOwnedRaffle(raffleId, req.admin!.id);
  if (!raffle) {
    res.status(404).json({ error: 'Rifa no encontrada.' });
    return;
  }

  const paymentMethod = normalizeText(req.body?.paymentMethod, 50);
  const db = getDb();
  releaseExpiredNumbers(db, raffleId);

  const buyer = db
    .prepare('SELECT id, full_name, phone FROM buyers WHERE id = ? AND raffle_id = ?')
    .get(buyerId, raffleId) as { id: number; full_name: string; phone: string } | undefined;

  if (!buyer) {
    res.status(404).json({ error: 'Comprador no encontrado en esta rifa.' });
    return;
  }

  const paidAt = new Date().toISOString();
  db.prepare(
    `UPDATE raffle_numbers
     SET status = 'paid', expires_at = NULL, paid_at = ?, payment_method = CASE WHEN ? != '' THEN ? ELSE payment_method END
     WHERE raffle_id = ? AND buyer_id = ? AND status = 'pending'`
  ).run(paidAt, paymentMethod, paymentMethod, raffleId, buyerId);

  const allBuyerNumbers = db
    .prepare('SELECT number FROM raffle_numbers WHERE raffle_id = ? AND buyer_id = ? ORDER BY number ASC')
    .all(raffleId, buyerId) as Array<{ number: string }>;

  res.json({
    ok: true,
    confirmedBuyer: {
      buyerId: buyer.id,
      fullName: buyer.full_name,
      phone: buyer.phone,
      numbers: allBuyerNumbers.map((r) => r.number),
    },
  });
});

adminRafflesRouter.post('/:id/winner', (req, res) => {
  const raffleId = Number(req.params.id);
  const raffle = getOwnedRaffle(raffleId, req.admin!.id);
  if (!raffle) {
    res.status(404).json({ error: 'Rifa no encontrada.' });
    return;
  }

  const winningNumber = req.body?.winningNumber;
  if (!isValidTwoDigitNumber(winningNumber)) {
    res.status(400).json({ error: 'Ingresa un número ganador válido de dos cifras (00 a 99).' });
    return;
  }

  const db = getDb();
  releaseExpiredNumbers(db, raffleId);

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE raffles
     SET winning_number = ?, status = 'closed', updated_at = ?
     WHERE id = ? AND admin_id = ?`
  ).run(winningNumber, now, raffleId, req.admin!.id);

  const winner = db
    .prepare(
      `SELECT rn.status, b.full_name, b.phone
       FROM raffle_numbers rn
       JOIN buyers b ON b.id = rn.buyer_id
       WHERE rn.raffle_id = ? AND rn.number = ?`
    )
    .get(raffleId, winningNumber) as
    | { status: 'pending' | 'paid'; full_name: string; phone: string }
    | undefined;

  res.json({
    ok: true,
    winningNumber,
    winner: winner
      ? {
          status: winner.status,
          fullName: winner.full_name,
          phone: winner.phone,
        }
      : null,
  });
});

adminRafflesRouter.get('/:id/export-csv', (req, res) => {
  const raffleId = Number(req.params.id);
  const raffle = getOwnedRaffle(raffleId, req.admin!.id);
  if (!raffle) {
    res.status(404).json({ error: 'Rifa no encontrada.' });
    return;
  }

  const db = getDb();
  releaseExpiredNumbers(db, raffleId);

  const rows = db
    .prepare(
      `SELECT rn.number, rn.status, rn.payment_method, rn.reserved_at, rn.paid_at,
              b.id AS buyer_id, b.full_name, b.phone, b.address, b.created_at
       FROM raffle_numbers rn
       JOIN buyers b ON b.id = rn.buyer_id
       WHERE rn.raffle_id = ?
       ORDER BY b.created_at DESC, rn.number ASC`
    )
    .all(raffleId) as Array<{
    number: string;
    status: 'pending' | 'paid';
    payment_method: string;
    reserved_at: string;
    paid_at: string | null;
    buyer_id: number;
    full_name: string;
    phone: string;
    address: string;
    created_at: string;
  }>;

  const grouped = new Map<
    number,
    {
      fullName: string;
      phone: string;
      address: string;
      numbers: string[];
      pendingCount: number;
      paidCount: number;
      methods: Set<string>;
      reservedAt: string;
      paidAt: string;
    }
  >();

  for (const row of rows) {
    let item = grouped.get(row.buyer_id);
    if (!item) {
      item = {
        fullName: row.full_name,
        phone: row.phone,
        address: row.address,
        numbers: [],
        pendingCount: 0,
        paidCount: 0,
        methods: new Set<string>(),
        reservedAt: row.reserved_at,
        paidAt: row.paid_at ?? '',
      };
      grouped.set(row.buyer_id, item);
    }
    item.numbers.push(row.number);
    if (row.status === 'paid') item.paidCount += 1;
    else item.pendingCount += 1;
    if (row.payment_method) item.methods.add(row.payment_method);
    if (row.paid_at && (!item.paidAt || row.paid_at > item.paidAt)) {
      item.paidAt = row.paid_at;
    }
  }

  const header = [
    'Nombre completo',
    'Celular / WhatsApp',
    'Dirección',
    'Números',
    'Cantidad',
    'Total COP',
    'Estado',
    'Método de pago',
    'Fecha de apartado',
    'Fecha de pago',
  ]
    .map(csvEscape)
    .join(',');

  const lines = [header];
  for (const entry of grouped.values()) {
    const statusLabel =
      entry.pendingCount === 0 ? 'Pagado' : entry.paidCount === 0 ? 'Pendiente' : 'Parcial';
    const totalCop = entry.numbers.length * raffle.ticket_price_cop;
    lines.push(
      [
        entry.fullName,
        entry.phone,
        entry.address,
        entry.numbers.join(' '),
        entry.numbers.length,
        totalCop,
        statusLabel,
        Array.from(entry.methods).join(' / '),
        entry.reservedAt,
        entry.paidAt,
      ]
        .map(csvEscape)
        .join(',')
    );
  }

  const bom = '\uFEFF';
  const csvContent = bom + lines.join('\r\n');
  const safeFilename = `${raffle.slug}-participantes.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  res.send(csvContent);
});
