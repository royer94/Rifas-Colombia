import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getDb } from '../db/connection.js';
import {
  SESSION_COOKIE_NAME,
  checkLoginRateLimit,
  clearFailedLogins,
  clearSessionCookie,
  createSession,
  deleteSession,
  getClientIp,
  recordFailedLogin,
  requireAdmin,
  setSessionCookie,
} from '../middleware/auth.js';
import { normalizeText } from '../utils/validation.js';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const username = normalizeText(req.body?.username, 50).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!username || !password) {
    res.status(400).json({ error: 'Ingresa tu usuario y contraseña.' });
    return;
  }

  const ip = getClientIp(req);
  const key = `${ip}:${username}`;
  const rate = checkLoginRateLimit(key);
  if (rate.blocked) {
    res.status(429).json({
      error: `Demasiados intentos fallidos. Intenta de nuevo en ${rate.retryMinutes} minuto(s).`,
    });
    return;
  }

  const db = getDb();
  const admin = db
    .prepare(
      'SELECT id, username, password_hash, display_name, must_change_password FROM admins WHERE lower(username) = ?'
    )
    .get(username) as
    | {
        id: number;
        username: string;
        password_hash: string;
        display_name: string;
        must_change_password: number;
      }
    | undefined;

  const valid = admin ? bcrypt.compareSync(password, admin.password_hash) : false;
  if (!admin || !valid) {
    const result = recordFailedLogin(key);
    if (result.blocked) {
      res.status(429).json({
        error: 'Demasiados intentos fallidos. Tu acceso quedó bloqueado temporalmente por 15 minutos.',
      });
      return;
    }
    res.status(401).json({
      error: `Usuario o contraseña incorrectos. Te quedan ${result.remainingAttempts} intento(s).`,
    });
    return;
  }

  clearFailedLogins(key);
  const { rawToken, expiresAt } = createSession(admin.id);
  setSessionCookie(res, rawToken, expiresAt);

  res.json({
    admin: {
      id: admin.id,
      username: admin.username,
      displayName: admin.display_name,
      mustChangePassword: admin.must_change_password === 1,
    },
  });
});

authRouter.post('/register', (req, res) => {
  const username = normalizeText(req.body?.username, 32).toLowerCase();
  const displayName = normalizeText(req.body?.displayName, 80);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!/^[a-z0-9_.-]{3,32}$/.test(username)) {
    res.status(400).json({
      error: 'El usuario debe tener entre 3 y 32 caracteres (solo letras minúsculas, números, ., _ o -).',
    });
    return;
  }
  if (displayName.length < 2) {
    res.status(400).json({ error: 'Ingresa tu nombre para mostrar (mínimo 2 caracteres).' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
    return;
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM admins WHERE lower(username) = ?').get(username);
  if (existing) {
    res.status(409).json({ error: 'Ese nombre de usuario ya está en uso.' });
    return;
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO admins (username, password_hash, display_name, must_change_password, created_at)
       VALUES (?, ?, ?, 0, ?)`
    )
    .run(username, passwordHash, displayName, now);

  const adminId = Number(info.lastInsertRowid);
  const { rawToken, expiresAt } = createSession(adminId);
  setSessionCookie(res, rawToken, expiresAt);

  res.status(201).json({
    admin: {
      id: adminId,
      username,
      displayName,
      mustChangePassword: false,
    },
  });
});

authRouter.post('/logout', (req, res) => {
  const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof rawToken === 'string') {
    deleteSession(rawToken);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAdmin, (req, res) => {
  res.json({ admin: req.admin });
});

authRouter.post('/change-password', requireAdmin, (req, res) => {
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

  if (!currentPassword || newPassword.length < 8) {
    res.status(400).json({
      error: 'Debes ingresar tu contraseña actual y una nueva contraseña de al menos 8 caracteres.',
    });
    return;
  }

  const db = getDb();
  const row = db
    .prepare('SELECT password_hash FROM admins WHERE id = ?')
    .get(req.admin!.id) as { password_hash: string } | undefined;

  if (!row || !bcrypt.compareSync(currentPassword, row.password_hash)) {
    res.status(401).json({ error: 'La contraseña actual no es correcta.' });
    return;
  }

  const newHash = bcrypt.hashSync(newPassword, 12);
  db.prepare('UPDATE admins SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(
    newHash,
    req.admin!.id
  );

  res.json({ ok: true });
});
