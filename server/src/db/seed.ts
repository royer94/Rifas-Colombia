import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { type DbAdapter, getDb } from './connection.js';
import { runMigrations } from './migrate.js';

export async function seedInitialAdmin(
  db: DbAdapter = getDb()
): Promise<{ created: boolean; username: string }> {
  await runMigrations(db);

  const username = 'admin';
  const existing = await db.queryOne<{ id: number }>(
    'SELECT id FROM admins WHERE username = ?',
    [username]
  );

  if (existing) {
    return { created: false, username };
  }

  const passwordHash = bcrypt.hashSync('Rifas2026!', 12);
  const now = new Date().toISOString();

  await db.execute(
    `INSERT INTO admins (username, password_hash, display_name, must_change_password, created_at)
     VALUES (?, ?, ?, 1, ?)`,
    [username, passwordHash, 'Administrador Principal', now]
  );

  return { created: true, username };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  seedInitialAdmin()
    .then(async (result) => {
      if (result.created) {
        console.log('Usuario administrador inicial creado:');
        console.log('  Usuario: admin');
        console.log('  Contraseña inicial: Rifas2026!');
        console.log('  AVISO DE SEGURIDAD: cambia esta contraseña apenas inicies sesión en /admin.');
      } else {
        console.log('El usuario administrador "admin" ya existe. No se modificó.');
      }
      await getDb().close();
    })
    .catch((err) => {
      console.error('Error al ejecutar seed:', err);
      process.exit(1);
    });
}
