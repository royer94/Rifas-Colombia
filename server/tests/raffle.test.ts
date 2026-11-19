import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import {
  SqliteDbAdapter,
  convertPlaceholders,
  setDbForTesting,
} from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedInitialAdmin } from '../src/db/seed.js';
import { createApp, resetDatabaseInitForTesting } from '../src/index.js';
import { releaseExpiredNumbers } from '../src/services/expiration.js';

let server: http.Server;
let baseUrl = '';
const db = new SqliteDbAdapter(':memory:');

async function request(
  path: string,
  options: RequestInit & { cookie?: string } = {}
): Promise<{
  status: number;
  headers: Headers;
  body: string;
  rawBytes: Buffer;
  json: Record<string, any>;
}> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (options.cookie) {
    headers.set('Cookie', options.cookie);
  }
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });
  const rawBytes = Buffer.from(await res.arrayBuffer());
  const body = rawBytes.toString('utf8');
  let json: Record<string, any> = {};
  try {
    json = body ? JSON.parse(body) : {};
  } catch {
    json = {};
  }
  return { status: res.status, headers: res.headers, body, rawBytes, json };
}

function extractSessionCookie(headers: Headers): string {
  const setCookie = headers.get('set-cookie') ?? '';
  const match = setCookie.match(/rifas_session=[^;]+/);
  return match ? match[0] : '';
}

describe('Flujo completo de Rifas Colombia', () => {
  let adminCookie = '';
  let secondAdminCookie = '';
  let raffleId = 0;
  const raffleSlug = 'rifa-prueba-medellin';

  before(async () => {
    resetDatabaseInitForTesting();
    setDbForTesting(db);
    await runMigrations(db);
    await seedInitialAdmin(db);
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
    setDbForTesting(null);
    resetDatabaseInitForTesting();
  });

  it('convierte placeholders SQL correctamente para PostgreSQL (Supabase)', () => {
    const converted = convertPlaceholders(
      "SELECT * FROM raffles WHERE slug = ? AND status != '?' AND id = ?"
    );
    assert.equal(converted, "SELECT * FROM raffles WHERE slug = $1 AND status != '?' AND id = $2");
  });

  it('crea el usuario admin inicial con bcrypt y bloquea tras 5 intentos fallidos', async () => {
    const row = (await db.queryOne<{
      username: string;
      password_hash: string;
      must_change_password: number;
    }>('SELECT username, password_hash, must_change_password FROM admins WHERE username = ?', [
      'admin',
    ]))!;

    assert.equal(row.username, 'admin');
    assert.equal(Number(row.must_change_password), 1);
    assert.ok(bcrypt.compareSync('Rifas2026!', row.password_hash));

    for (let i = 0; i < 4; i++) {
      const fail = await request('/api/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: 'intentos_test', password: 'mal' }),
      });
      assert.equal(fail.status, 401);
    }
    const fifth = await request('/api/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'intentos_test', password: 'mal' }),
    });
    assert.equal(fifth.status, 429);

    const ok = await request('/api/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'Rifas2026!' }),
    });
    assert.equal(ok.status, 200);
    adminCookie = extractSessionCookie(ok.headers);
    assert.ok(adminCookie.startsWith('rifas_session='));
    assert.ok((ok.headers.get('set-cookie') ?? '').toLowerCase().includes('httponly'));
  });

  it('permite crear una rifa con imagen opcional y aísla los datos entre administradores', async () => {
    const missingOrganizerReject = await request('/api/admin/raffles', {
      method: 'POST',
      cookie: adminCookie,
      body: JSON.stringify({
        name: 'Rifa Sin Organizador',
        drawDate: '2026-12-20',
        prizeText: 'Premio',
        lotteryName: 'Lotería de Medellín',
        ticketPriceCop: 20000,
        paymentInstructions: 'Nequi 3001112233 a nombre de Juan',
        releaseHours: 24,
        status: 'active',
      }),
    });
    assert.equal(missingOrganizerReject.status, 400);

    const svgReject = await request('/api/admin/raffles', {
      method: 'POST',
      cookie: adminCookie,
      body: JSON.stringify({
        name: 'Rifa SVG Inválida',
        drawDate: '2026-12-20',
        prizeText: 'Premio',
        prizeImage: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
        organizerName: 'Roman Ramirez',
        organizerPhone: '3014445566',
        lotteryName: 'Lotería de Medellín',
        ticketPriceCop: 20000,
        paymentInstructions: 'Nequi 3001112233 a nombre de Juan',
        releaseHours: 24,
        status: 'active',
      }),
    });
    assert.equal(svgReject.status, 400);

    const samplePng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    const createRes = await request('/api/admin/raffles', {
      method: 'POST',
      cookie: adminCookie,
      body: JSON.stringify({
        name: 'Rifa Prueba Medellín',
        slug: raffleSlug,
        description: 'Rifa benéfica transparente',
        drawDate: '2026-12-20',
        prizeText: 'Moto NMAX 2026 o $10.000.000',
        prizeImage: samplePng,
        organizerName: 'Roman Ramirez',
        organizerPhone: '3014445566',
        lotteryName: 'Lotería de Medellín',
        ticketPriceCop: 20000,
        paymentInstructions: 'Nequi 3001112233 a nombre de Juan',
        releaseHours: 24,
        status: 'active',
      }),
    });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.json.raffle.prizeImage, samplePng);
    assert.equal(createRes.json.raffle.organizerName, 'Roman Ramirez');
    assert.equal(createRes.json.raffle.organizerPhone, '3014445566');
    raffleId = createRes.json.raffle.id;

    const reg2 = await request('/api/admin/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: 'otro_admin',
        displayName: 'Otro Organizador',
        password: 'Password123!',
      }),
    });
    assert.equal(reg2.status, 201);
    secondAdminCookie = extractSessionCookie(reg2.headers);

    const list2 = await request('/api/admin/raffles', { cookie: secondAdminCookie });
    assert.equal(list2.status, 200);
    assert.equal(list2.json.raffles.length, 0);

    const forbiddenDetail = await request(`/api/admin/raffles/${raffleId}`, {
      cookie: secondAdminCookie,
    });
    assert.equal(forbiddenDetail.status, 404);
  });

  it('garantiza reserva atómica anti-duplicados y no expone datos personales en la vista pública', async () => {
    const [res1, res2] = await Promise.all([
      request(`/api/public/raffles/${raffleSlug}/reserve`, {
        method: 'POST',
        body: JSON.stringify({
          numbers: ['27', '28'],
          fullName: 'Laura Martínez',
          phone: '3001234567',
          address: 'Envigado',
        }),
      }),
      request(`/api/public/raffles/${raffleSlug}/reserve`, {
        method: 'POST',
        body: JSON.stringify({
          numbers: ['27', '29'],
          fullName: 'Carlos Gómez',
          phone: '3109876543',
          address: 'Bello',
        }),
      }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    assert.deepEqual(statuses, [201, 409]);

    const winnerRes = res1.status === 201 ? res1 : res2;
    const loserRes = res1.status === 409 ? res1 : res2;

    assert.ok(loserRes.json.error.includes('27'));

    const publicBoard = await request(`/api/public/raffles/${raffleSlug}`);
    assert.equal(publicBoard.status, 200);
    assert.equal(publicBoard.json.counts.pending, 2);
    assert.equal(publicBoard.json.raffle.organizerName, 'Roman Ramirez');
    assert.equal(publicBoard.json.raffle.organizerPhone, '3014445566');

    const expectedUnreserved = winnerRes === res1 ? '29' : '28';
    const numObj = publicBoard.json.numbers.find((n: any) => n.number === expectedUnreserved);
    assert.equal(numObj.status, 'available');

    assert.equal(publicBoard.body.includes('Laura Martínez'), false);
    assert.equal(publicBoard.body.includes('3001234567'), false);
    assert.equal(publicBoard.body.includes('Carlos Gómez'), false);
  });

  it('confirma pago, libera, reasigna, exporta CSV UTF-8 BOM y registra ganador', async () => {
    const detail = await request(`/api/admin/raffles/${raffleId}`, { cookie: adminCookie });
    assert.equal(detail.status, 200);
    const takenNumbers = detail.json.numbers
      .filter((n: any) => n.status === 'pending')
      .map((n: any) => n.number);
    assert.equal(takenNumbers.length, 2);

    const confirmRes = await request(
      `/api/admin/raffles/${raffleId}/numbers/${takenNumbers[0]}/confirm`,
      {
        method: 'POST',
        cookie: adminCookie,
        body: JSON.stringify({ paymentMethod: 'Nequi' }),
      }
    );
    assert.equal(confirmRes.status, 200);

    const releaseRes = await request(
      `/api/admin/raffles/${raffleId}/numbers/${takenNumbers[1]}/release`,
      {
        method: 'POST',
        cookie: adminCookie,
      }
    );
    assert.equal(releaseRes.status, 200);

    const csvRes = await request(`/api/admin/raffles/${raffleId}/export-csv`, {
      cookie: adminCookie,
    });
    assert.equal(csvRes.status, 200);
    assert.deepEqual(Array.from(csvRes.rawBytes.subarray(0, 3)), [0xef, 0xbb, 0xbf]);
    assert.ok(csvRes.body.includes(takenNumbers[0]));

    const winRes = await request(`/api/admin/raffles/${raffleId}/winner`, {
      method: 'POST',
      cookie: adminCookie,
      body: JSON.stringify({ winningNumber: takenNumbers[0] }),
    });
    assert.equal(winRes.status, 200);

    const closedPublic = await request(`/api/public/raffles/${raffleSlug}`);
    assert.equal(closedPublic.status, 200);
    assert.equal(closedPublic.json.raffle.status, 'closed');
    assert.equal(closedPublic.json.raffle.winningNumber, takenNumbers[0]);
    assert.ok(closedPublic.json.raffle.winnerName);
    assert.equal(closedPublic.body.includes('3001234567'), false);
    assert.equal(closedPublic.body.includes('3109876543'), false);
  });

  it('libera automáticamente los números amarillos cuyo plazo ya venció', async () => {
    const pastIso = new Date(Date.now() - 60_000).toISOString();
    const buyerId = await db.insertReturningId(
      `INSERT INTO buyers (raffle_id, full_name, phone, address, created_at)
       VALUES (?, ?, ?, '', ?)`,
      [raffleId, 'Comprador Vencido', '3205556677', pastIso]
    );
    await db.execute(
      `INSERT INTO raffle_numbers (raffle_id, number, buyer_id, status, payment_method, reserved_at, expires_at, paid_at)
       VALUES (?, '77', ?, 'pending', '', ?, ?, NULL)`,
      [raffleId, buyerId, pastIso, pastIso]
    );

    const released = await releaseExpiredNumbers(db, raffleId);
    assert.equal(released, 1);

    const row = await db.queryOne<{ number: string }>(
      "SELECT number FROM raffle_numbers WHERE raffle_id = ? AND number = '77'",
      [raffleId]
    );
    assert.equal(row, undefined);
  });
});
