import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { getDb } from '../db/connection.js';

export const SESSION_COOKIE_NAME = 'rifas_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 días
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 1000 * 60 * 15; // 15 minutos

export interface AdminUser {
  id: number;
  username: string;
  displayName: string;
  mustChangePassword: boolean;
}

declare global {
  namespace Express {
    interface Request {
      admin?: AdminUser;
    }
  }
}

export function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export async function createSession(
  adminId: number
): Promise<{ rawToken: string; expiresAt: Date }> {
  const db = getDb();
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  await db.execute('DELETE FROM sessions WHERE expires_at <= ?', [now.toISOString()]);

  await db.execute(
    'INSERT INTO sessions (id, admin_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    [tokenHash, adminId, expiresAt.toISOString(), now.toISOString()]
  );

  return { rawToken, expiresAt };
}

export async function deleteSession(rawToken: string): Promise<void> {
  if (!rawToken) return;
  const db = getDb();
  await db.execute('DELETE FROM sessions WHERE id = ?', [hashSessionToken(rawToken)]);
}

function isSecureCookie(req?: Request): boolean {
  return (
    process.env.COOKIE_SECURE === 'true' ||
    process.env.VERCEL === '1' ||
    Boolean(req?.secure)
  );
}

export function setSessionCookie(
  res: Response,
  rawToken: string,
  expiresAt: Date,
  req?: Request
): void {
  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookie(req),
    expires: expiresAt,
    path: '/',
  });
}

export function clearSessionCookie(res: Response, req?: Request): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookie(req),
    path: '/',
  });
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (typeof rawToken !== 'string' || rawToken.length < 20) {
      res.status(401).json({ error: 'Debes iniciar sesión como administrador.' });
      return;
    }

    const db = getDb();
    const nowIso = new Date().toISOString();
    const row = await db.queryOne<{
      id: number;
      username: string;
      display_name: string;
      must_change_password: number;
    }>(
      `SELECT a.id, a.username, a.display_name, a.must_change_password
       FROM sessions s
       JOIN admins a ON a.id = s.admin_id
       WHERE s.id = ? AND s.expires_at > ?`,
      [hashSessionToken(rawToken), nowIso]
    );

    if (!row) {
      clearSessionCookie(res, req);
      res.status(401).json({ error: 'Tu sesión expiró. Vuelve a iniciar sesión.' });
      return;
    }

    req.admin = {
      id: Number(row.id),
      username: row.username,
      displayName: row.display_name,
      mustChangePassword: Number(row.must_change_password) === 1,
    };
    next();
  } catch (err) {
    next(err);
  }
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export async function checkLoginRateLimit(
  key: string
): Promise<{ blocked: boolean; retryMinutes: number }> {
  const db = getDb();
  const row = await db.queryOne<{ attempts: number; locked_until: string | null }>(
    'SELECT attempts, locked_until FROM login_attempts WHERE attempt_key = ?',
    [key]
  );

  if (!row || !row.locked_until) {
    return { blocked: false, retryMinutes: 0 };
  }

  const lockedUntilMs = Date.parse(row.locked_until);
  const nowMs = Date.now();
  if (lockedUntilMs > nowMs) {
    return {
      blocked: true,
      retryMinutes: Math.max(1, Math.ceil((lockedUntilMs - nowMs) / 60000)),
    };
  }

  return { blocked: false, retryMinutes: 0 };
}

export async function recordFailedLogin(
  key: string
): Promise<{ blocked: boolean; remainingAttempts: number }> {
  const db = getDb();
  const now = new Date();
  const nowIso = now.toISOString();
  const existing = await db.queryOne<{ attempts: number; locked_until: string | null }>(
    'SELECT attempts, locked_until FROM login_attempts WHERE attempt_key = ?',
    [key]
  );

  let nextAttempts = 1;
  if (existing) {
    const expiredLock =
      existing.locked_until && Date.parse(existing.locked_until) <= now.getTime();
    nextAttempts = expiredLock ? 1 : Number(existing.attempts) + 1;
  }

  const shouldLock = nextAttempts >= MAX_LOGIN_ATTEMPTS;
  const lockedUntil = shouldLock
    ? new Date(now.getTime() + LOCK_DURATION_MS).toISOString()
    : null;

  await db.execute(
    `INSERT INTO login_attempts (attempt_key, attempts, locked_until, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(attempt_key) DO UPDATE SET
       attempts = excluded.attempts,
       locked_until = excluded.locked_until,
       updated_at = excluded.updated_at`,
    [key, nextAttempts, lockedUntil, nowIso]
  );

  return {
    blocked: shouldLock,
    remainingAttempts: Math.max(0, MAX_LOGIN_ATTEMPTS - nextAttempts),
  };
}

export async function clearFailedLogins(key: string): Promise<void> {
  const db = getDb();
  await db.execute('DELETE FROM login_attempts WHERE attempt_key = ?', [key]);
}
