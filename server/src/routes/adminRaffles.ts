import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { requireAdmin } from '../middleware/auth.js';
import { releaseExpiredNumbers, releaseExpiredNumbersWithinTx } from '../services/expiration.js';
import {
  csvEscape,
  isValidDateYmd,
  isValidTwoDigitNumber,
  normalizePhone,
  normalizeText,
  slugify,
  validatePrizeImage,
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
  prize_image: string;
  organizer_name: string;
  organizer_phone: string;
  lottery_name: string;
  ticket_price_cop: number;
  payment_instructions: string;
  release_hours: number;
  status: 'draft' | 'active' | 'closed';
  winning_number: string | null;
  created_at: string;
  updated_at: string;
}

function toAdminRaffleDto(r: RaffleDbRow) {
  return {
    id: Number(r.id),
    slug: r.slug,
    name: r.name,
    description: r.description,
    drawDate: r.draw_date,
    prizeText: r.prize_text,
    prizeImage: r.prize_image ?? '',
    organizerName: r.organizer_name ?? '',
    organizerPhone: r.organizer_phone ?? '',
    lotteryName: r.lottery_name,
    ticketPriceCop: Number(r.ticket_price_cop),
    paymentInstructions: r.payment_instructions,
    releaseHours: Number(r.release_hours),
    status: r.status,
    winningNumber: r.winning_number,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

async function getOwnedRaffle(raffleId: number, adminId: number): Promise<RaffleDbRow | null> {
  if (!Number.isInteger(raffleId) || raffleId <= 0) return null;
  const db = getDb();
  const row = await db.queryOne<RaffleDbRow>(
    'SELECT * FROM raffles WHERE id = ? AND admin_id = ?',
    [raffleId, adminId]
  );
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
  const imageCheck = validatePrizeImage(body?.prizeImage);
  const organizerName = normalizeText(body?.organizerName, 100);
  const rawOrganizerPhone = normalizeText(body?.organizerPhone, 20);
  const organizerPhone = rawOrganizerPhone ? normalizePhone(rawOrganizerPhone) : '';

  if (rawOrganizerPhone && !organizerPhone) {
    return {
      error:
        'El WhatsApp del organizador debe ser un celular colombiano válido de 10 dígitos (ej: 3001234567) o déjalo vacío.',
    };
  }

  if (name.length < 3) {
    return { error: 'El nombre de la rifa debe tener al menos 3 caracteres.' };
  }
  if (!isValidDateYmd(drawDate)) {
    return { error: 'Selecciona una fecha de sorteo válida.' };
  }
  if (prizeText.length < 2) {
    return { error: 'Escribe el premio de la rifa.' };
  }
  if (!imageCheck.ok) {
    return { error: imageCheck.error };
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
      prizeImage: imageCheck.value,
      organizerName,
      organizerPhone: organizerPhone || '',
      lotteryName,
      ticketPriceCop,
      paymentInstructions,
      releaseHours,
      status: status as 'draft' | 'active' | 'closed',
      customSlug: rawSlug,
    },
  };
}

async function generateUniqueSlug(baseName: string, excludeRaffleId?: number): Promise<string> {
  const db = getDb();
  const base = slugify(baseName) || 'rifa';
  let candidate = base;
  let counter = 2;

  while (true) {
    const existing = excludeRaffleId
      ? await db.queryOne<{ id: number }>('SELECT id FROM raffles WHERE slug = ? AND id != ?', [
          candidate,
          excludeRaffleId,
        ])
      : await db.queryOne<{ id: number }>('SELECT id FROM raffles WHERE slug = ?', [candidate]);
    if (!existing) return candidate;
    candidate = `${base}-${counter}`;
    counter += 1;
  }
}

adminRafflesRouter.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    await releaseExpiredNumbers(db);

    const rows = await db.query<
      RaffleDbRow & { pending_count: number | string; paid_count: number | string }
    >(
      `SELECT r.*,
              SUM(CASE WHEN rn.status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
              SUM(CASE WHEN rn.status = 'paid' THEN 1 ELSE 0 END) AS paid_count
       FROM raffles r
       LEFT JOIN raffle_numbers rn ON rn.raffle_id = r.id
       WHERE r.admin_id = ?
       GROUP BY r.id
       ORDER BY r.created_at DESC, r.id DESC`,
      [req.admin!.id]
    );

    res.json({
      raffles: rows.map((r) => {
        const pending = Number(r.pending_count ?? 0);
        const paid = Number(r.paid_count ?? 0);
        const ticketPriceCop = Number(r.ticket_price_cop);
        return {
          ...toAdminRaffleDto(r),
          counts: {
            available: 100 - pending - paid,
            pending,
            paid,
          },
          totalCollectedCop: paid * ticketPriceCop,
          pendingAmountCop: pending * ticketPriceCop,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

adminRafflesRouter.post('/', async (req, res, next) => {
  try {
    const parsed = parseRafflePayload(req.body ?? {});
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const db = getDb();
    const data = parsed.data;
    let slug = data.customSlug;

    if (slug) {
      const exists = await db.queryOne<{ id: number }>('SELECT id FROM raffles WHERE slug = ?', [
        slug,
      ]);
      if (exists) {
        res.status(409).json({ error: `El enlace "/r/${slug}" ya está ocupado por otra rifa.` });
        return;
      }
    } else {
      slug = await generateUniqueSlug(data.name);
    }

    const now = new Date().toISOString();
    const insertedId = await db.insertReturningId(
      `INSERT INTO raffles (
         admin_id, slug, name, description, draw_date, prize_text, prize_image,
         organizer_name, organizer_phone, lottery_name,
         ticket_price_cop, payment_instructions, release_hours, status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.admin!.id,
        slug,
        data.name,
        data.description,
        data.drawDate,
        data.prizeText,
        data.prizeImage,
        data.organizerName,
        data.organizerPhone,
        data.lotteryName,
        data.ticketPriceCop,
        data.paymentInstructions,
        data.releaseHours,
        data.status,
        now,
        now,
      ]
    );

    const created = (await getOwnedRaffle(insertedId, req.admin!.id))!;
    res.status(201).json({
      raffle: toAdminRaffleDto(created),
    });
  } catch (err) {
    next(err);
  }
});

adminRafflesRouter.put('/:id', async (req, res, next) => {
  try {
    const raffleId = Number(req.params.id);
    const existing = await getOwnedRaffle(raffleId, req.admin!.id);
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
      const slugConflict = await db.queryOne<{ id: number }>(
        'SELECT id FROM raffles WHERE slug = ? AND id != ?',
        [nextSlug, raffleId]
      );
      if (slugConflict) {
        res
          .status(409)
          .json({ error: `El enlace "/r/${nextSlug}" ya está ocupado por otra rifa.` });
        return;
      }
    }

    const now = new Date().toISOString();
    await db.execute(
      `UPDATE raffles
       SET slug = ?, name = ?, description = ?, draw_date = ?, prize_text = ?,
           prize_image = ?, organizer_name = ?, organizer_phone = ?, lottery_name = ?,
           ticket_price_cop = ?, payment_instructions = ?,
           release_hours = ?, status = ?, updated_at = ?
       WHERE id = ? AND admin_id = ?`,
      [
        nextSlug,
        data.name,
        data.description,
        data.drawDate,
        data.prizeText,
        data.prizeImage,
        data.organizerName,
        data.organizerPhone,
        data.lotteryName,
        data.ticketPriceCop,
        data.paymentInstructions,
        data.releaseHours,
        data.status,
        now,
        raffleId,
        req.admin!.id,
      ]
    );

    const updated = (await getOwnedRaffle(raffleId, req.admin!.id))!;
    res.json({
      raffle: toAdminRaffleDto(updated),
    });
  } catch (err) {
    next(err);
  }
});

adminRafflesRouter.delete('/:id', async (req, res, next) => {
  try {
    const raffleId = Number(req.params.id);
    const existing = await getOwnedRaffle(raffleId, req.admin!.id);
    if (!existing) {
      res.status(404).json({ error: 'Rifa no encontrada.' });
      return;
    }

    const db = getDb();
    await db.execute('DELETE FROM raffles WHERE id = ? AND admin_id = ?', [
      raffleId,
      req.admin!.id,
    ]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

adminRafflesRouter.get('/:id', async (req, res, next) => {
  try {
    const raffleId = Number(req.params.id);
    const raffle = await getOwnedRaffle(raffleId, req.admin!.id);
    if (!raffle) {
      res.status(404).json({ error: 'Rifa no encontrada.' });
      return;
    }

    const db = getDb();
    await releaseExpiredNumbers(db, raffleId);

    const rows = await db.query<{
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
    }>(
      `SELECT rn.number, rn.status, rn.payment_method, rn.reserved_at, rn.expires_at, rn.paid_at,
              b.id AS buyer_id, b.full_name, b.phone, b.address, b.created_at AS buyer_created_at
       FROM raffle_numbers rn
       JOIN buyers b ON b.id = rn.buyer_id
       WHERE rn.raffle_id = ?
       ORDER BY rn.number ASC`,
      [raffleId]
    );

    const ticketPriceCop = Number(raffle.ticket_price_cop);
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
      const buyerId = Number(row.buyer_id);
      byNumber.set(row.number, row);
      if (row.status === 'pending') pendingCount += 1;
      else paidCount += 1;

      let entry = buyersMap.get(buyerId);
      if (!entry) {
        entry = {
          buyerId,
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
        buyersMap.set(buyerId, entry);
      }

      entry.numbers.push(row.number);
      entry.totalCop += ticketPriceCop;
      if (row.status === 'pending') {
        entry.pendingNumbers.push(row.number);
        if (
          row.expires_at &&
          (!entry.earliestExpiresAt || row.expires_at < entry.earliestExpiresAt)
        ) {
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
          buyerId: Number(hit.buyer_id),
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
      raffle: toAdminRaffleDto(raffle),
      counts: {
        available: 100 - pendingCount - paidCount,
        pending: pendingCount,
        paid: paidCount,
        totalCollectedCop: paidCount * ticketPriceCop,
        pendingAmountCop: pendingCount * ticketPriceCop,
      },
      numbers,
      participants,
    });
  } catch (err) {
    next(err);
  }
});

adminRafflesRouter.post('/:id/numbers/:number/confirm', async (req, res, next) => {
  try {
    const raffleId = Number(req.params.id);
    const number = req.params.number;
    if (!isValidTwoDigitNumber(number)) {
      res.status(400).json({ error: 'Número inválido.' });
      return;
    }

    const raffle = await getOwnedRaffle(raffleId, req.admin!.id);
    if (!raffle) {
      res.status(404).json({ error: 'Rifa no encontrada.' });
      return;
    }

    const paymentMethod = normalizeText(req.body?.paymentMethod, 50);
    const db = getDb();
    await releaseExpiredNumbers(db, raffleId);

    const row = await db.queryOne<{
      status: 'pending' | 'paid';
      buyer_id: number;
      full_name: string;
      phone: string;
    }>(
      `SELECT rn.status, b.id AS buyer_id, b.full_name, b.phone
       FROM raffle_numbers rn
       JOIN buyers b ON b.id = rn.buyer_id
       WHERE rn.raffle_id = ? AND rn.number = ?`,
      [raffleId, number]
    );

    if (!row) {
      res
        .status(404)
        .json({ error: `El número ${number} está disponible (no tiene comprador apartado).` });
      return;
    }

    const paidAt = new Date().toISOString();
    await db.execute(
      `UPDATE raffle_numbers
       SET status = 'paid',
           expires_at = NULL,
           paid_at = ?,
           payment_method = COALESCE(NULLIF(?, ''), payment_method)
       WHERE raffle_id = ? AND number = ?`,
      [paidAt, paymentMethod, raffleId, number]
    );

    res.json({
      ok: true,
      confirmed: {
        number,
        buyerName: row.full_name,
        buyerPhone: row.phone,
      },
    });
  } catch (err) {
    next(err);
  }
});

adminRafflesRouter.post('/:id/numbers/:number/release', async (req, res, next) => {
  try {
    const raffleId = Number(req.params.id);
    const number = req.params.number;
    if (!isValidTwoDigitNumber(number)) {
      res.status(400).json({ error: 'Número inválido.' });
      return;
    }

    const raffle = await getOwnedRaffle(raffleId, req.admin!.id);
    if (!raffle) {
      res.status(404).json({ error: 'Rifa no encontrada.' });
      return;
    }

    const db = getDb();
    await db.withTransaction(async (tx) => {
      await tx.execute('DELETE FROM raffle_numbers WHERE raffle_id = ? AND number = ?', [
        raffleId,
        number,
      ]);
      await tx.execute(
        `DELETE FROM buyers
         WHERE raffle_id = ?
           AND NOT EXISTS (SELECT 1 FROM raffle_numbers rn WHERE rn.buyer_id = buyers.id)`,
        [raffleId]
      );
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

adminRafflesRouter.post('/:id/numbers/:number/reassign', async (req, res, next) => {
  try {
    const raffleId = Number(req.params.id);
    const number = req.params.number;
    if (!isValidTwoDigitNumber(number)) {
      res.status(400).json({ error: 'Número inválido.' });
      return;
    }

    const raffle = await getOwnedRaffle(raffleId, req.admin!.id);
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
      res.status(400).json({
        error: 'Ingresa un celular colombiano válido de 10 dígitos (ej: 3001234567).',
      });
      return;
    }

    const db = getDb();
    const releaseHours = Number(raffle.release_hours);
    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAtIso = markPaid
      ? null
      : new Date(now.getTime() + releaseHours * 60 * 60 * 1000).toISOString();

    await db.withTransaction(async (tx) => {
      if (tx.dialect === 'postgres') {
        await tx.queryOne('SELECT id FROM raffles WHERE id = ? FOR UPDATE', [raffleId]);
      }
      const existingNum = await tx.queryOne<{ id: number }>(
        'SELECT id FROM raffle_numbers WHERE raffle_id = ? AND number = ?',
        [raffleId, number]
      );

      const buyerId = await tx.insertReturningId(
        `INSERT INTO buyers (raffle_id, full_name, phone, address, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [raffleId, fullName, phone, address, nowIso]
      );

      if (existingNum) {
        await tx.execute(
          `UPDATE raffle_numbers
           SET buyer_id = ?, status = ?, payment_method = ?, reserved_at = ?, expires_at = ?, paid_at = ?
           WHERE raffle_id = ? AND number = ?`,
          [
            buyerId,
            markPaid ? 'paid' : 'pending',
            paymentMethod,
            nowIso,
            expiresAtIso,
            markPaid ? nowIso : null,
            raffleId,
            number,
          ]
        );

        await tx.execute(
          `DELETE FROM buyers
           WHERE raffle_id = ?
             AND NOT EXISTS (SELECT 1 FROM raffle_numbers rn WHERE rn.buyer_id = buyers.id)`,
          [raffleId]
        );
      } else {
        await tx.execute(
          `INSERT INTO raffle_numbers (raffle_id, number, buyer_id, status, payment_method, reserved_at, expires_at, paid_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            raffleId,
            number,
            buyerId,
            markPaid ? 'paid' : 'pending',
            paymentMethod,
            nowIso,
            expiresAtIso,
            markPaid ? nowIso : null,
          ]
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
  } catch (err) {
    next(err);
  }
});

adminRafflesRouter.post('/:id/numbers/assign', async (req, res, next) => {
  try {
    const raffleId = Number(req.params.id);
    const raffle = await getOwnedRaffle(raffleId, req.admin!.id);
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
    const markPaid = req.body?.markPaid !== false;
    const paymentMethod =
      normalizeText(req.body?.paymentMethod, 50) || (markPaid ? 'Efectivo' : '');

    if (numbers.length === 0) {
      res.status(400).json({ error: 'Selecciona al menos un número válido entre 00 y 99.' });
      return;
    }
    if (fullName.length < 3) {
      res.status(400).json({ error: 'Ingresa el nombre completo del comprador.' });
      return;
    }
    if (!phone) {
      res.status(400).json({
        error: 'Ingresa un celular colombiano válido de 10 dígitos (ej: 3001234567).',
      });
      return;
    }

    const db = getDb();
    const releaseHours = Number(raffle.release_hours);
    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAtIso = markPaid
      ? null
      : new Date(now.getTime() + releaseHours * 60 * 60 * 1000).toISOString();

    await db.withTransaction(async (tx) => {
      if (tx.dialect === 'postgres') {
        await tx.queryOne('SELECT id FROM raffles WHERE id = ? FOR UPDATE', [raffleId]);
      }

      await releaseExpiredNumbersWithinTx(tx, raffleId);

      const placeholders = numbers.map(() => '?').join(',');
      const taken = await tx.query<{ number: string }>(
        `SELECT number FROM raffle_numbers WHERE raffle_id = ? AND number IN (${placeholders}) ORDER BY number`,
        [raffleId, ...numbers]
      );

      if (taken.length > 0) {
        throw new Error(`TAKEN:${taken.map((t) => t.number).join(', ')}`);
      }

      const buyerId = await tx.insertReturningId(
        `INSERT INTO buyers (raffle_id, full_name, phone, address, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [raffleId, fullName, phone, address, nowIso]
      );

      for (const num of numbers) {
        await tx.execute(
          `INSERT INTO raffle_numbers (raffle_id, number, buyer_id, status, payment_method, reserved_at, expires_at, paid_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            raffleId,
            num,
            buyerId,
            markPaid ? 'paid' : 'pending',
            paymentMethod,
            nowIso,
            expiresAtIso,
            markPaid ? nowIso : null,
          ]
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
    next(err);
  }
});

adminRafflesRouter.post('/:id/buyers/:buyerId/confirm-all', async (req, res, next) => {
  try {
    const raffleId = Number(req.params.id);
    const buyerId = Number(req.params.buyerId);
    const raffle = await getOwnedRaffle(raffleId, req.admin!.id);
    if (!raffle) {
      res.status(404).json({ error: 'Rifa no encontrada.' });
      return;
    }

    const paymentMethod = normalizeText(req.body?.paymentMethod, 50);
    const db = getDb();
    await releaseExpiredNumbers(db, raffleId);

    const buyer = await db.queryOne<{ id: number; full_name: string; phone: string }>(
      'SELECT id, full_name, phone FROM buyers WHERE id = ? AND raffle_id = ?',
      [buyerId, raffleId]
    );

    if (!buyer) {
      res.status(404).json({ error: 'Comprador no encontrado en esta rifa.' });
      return;
    }

    const paidAt = new Date().toISOString();
    await db.execute(
      `UPDATE raffle_numbers
       SET status = 'paid',
           expires_at = NULL,
           paid_at = ?,
           payment_method = COALESCE(NULLIF(?, ''), payment_method)
       WHERE raffle_id = ? AND buyer_id = ? AND status = 'pending'`,
      [paidAt, paymentMethod, raffleId, buyerId]
    );

    const allBuyerNumbers = await db.query<{ number: string }>(
      'SELECT number FROM raffle_numbers WHERE raffle_id = ? AND buyer_id = ? ORDER BY number ASC',
      [raffleId, buyerId]
    );

    res.json({
      ok: true,
      confirmedBuyer: {
        buyerId: Number(buyer.id),
        fullName: buyer.full_name,
        phone: buyer.phone,
        numbers: allBuyerNumbers.map((r) => r.number),
      },
    });
  } catch (err) {
    next(err);
  }
});

adminRafflesRouter.post('/:id/winner', async (req, res, next) => {
  try {
    const raffleId = Number(req.params.id);
    const raffle = await getOwnedRaffle(raffleId, req.admin!.id);
    if (!raffle) {
      res.status(404).json({ error: 'Rifa no encontrada.' });
      return;
    }

    const winningNumber = req.body?.winningNumber;
    if (!isValidTwoDigitNumber(winningNumber)) {
      res
        .status(400)
        .json({ error: 'Ingresa un número ganador válido de dos cifras (00 a 99).' });
      return;
    }

    const db = getDb();
    await releaseExpiredNumbers(db, raffleId);

    const now = new Date().toISOString();
    await db.execute(
      `UPDATE raffles
       SET winning_number = ?, status = 'closed', updated_at = ?
       WHERE id = ? AND admin_id = ?`,
      [winningNumber, now, raffleId, req.admin!.id]
    );

    const winner = await db.queryOne<{
      status: 'pending' | 'paid';
      full_name: string;
      phone: string;
    }>(
      `SELECT rn.status, b.full_name, b.phone
       FROM raffle_numbers rn
       JOIN buyers b ON b.id = rn.buyer_id
       WHERE rn.raffle_id = ? AND rn.number = ?`,
      [raffleId, winningNumber]
    );

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
  } catch (err) {
    next(err);
  }
});

adminRafflesRouter.get('/:id/export-csv', async (req, res, next) => {
  try {
    const raffleId = Number(req.params.id);
    const raffle = await getOwnedRaffle(raffleId, req.admin!.id);
    if (!raffle) {
      res.status(404).json({ error: 'Rifa no encontrada.' });
      return;
    }

    const db = getDb();
    await releaseExpiredNumbers(db, raffleId);

    const rows = await db.query<{
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
    }>(
      `SELECT rn.number, rn.status, rn.payment_method, rn.reserved_at, rn.paid_at,
              b.id AS buyer_id, b.full_name, b.phone, b.address, b.created_at
       FROM raffle_numbers rn
       JOIN buyers b ON b.id = rn.buyer_id
       WHERE rn.raffle_id = ?
       ORDER BY b.created_at DESC, rn.number ASC`,
      [raffleId]
    );

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
      const buyerId = Number(row.buyer_id);
      let item = grouped.get(buyerId);
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
        grouped.set(buyerId, item);
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

    const ticketPriceCop = Number(raffle.ticket_price_cop);
    const lines = [header];
    for (const entry of grouped.values()) {
      const statusLabel =
        entry.pendingCount === 0 ? 'Pagado' : entry.paidCount === 0 ? 'Pendiente' : 'Parcial';
      const totalCop = entry.numbers.length * ticketPriceCop;
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
  } catch (err) {
    next(err);
  }
});
