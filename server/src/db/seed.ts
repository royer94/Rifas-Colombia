import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import type { DatabaseSync } from 'node:sqlite';
import { getDb } from './connection.js';
import { runMigrations } from './migrate.js';

export function seedInitialAdmin(db: DatabaseSync = getDb()): { created: boolean; username: string } {
  runMigrations(db);

  const username = 'admin';
  const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username) as
    | { id: number }
    | undefined;

  if (existing) {
    return { created: false, username };
  }

  const passwordHash = bcrypt.hashSync('Rifas2026!', 12);
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO admins (username, password_hash, display_name, must_change_password, created_at)
     VALUES (?, ?, ?, 1, ?)`
  ).run(username, passwordHash, 'Administrador Principal', now);

  return { created: true, username };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = seedInitialAdmin();
  if (result.created) {
    console.log('Usuario administrador inicial creado:');
    console.log('  Usuario: admin');
    console.log('  Contraseña inicial: Rifas2026!');
    console.log('  AVISO DE SEGURIDAD: cambia esta contraseña apenas inicies sesión en /admin.');
  } else {
    console.log('El usuario administrador "admin" ya existe. No se modificó.');
  }
}
