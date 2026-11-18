import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type DbAdapter, getDb } from './connection.js';

function resolveMigrationsDir(dialect: 'sqlite' | 'postgres'): string {
  const folder = dialect === 'postgres' ? 'migrations_pg' : 'migrations';
  const candidates = [
    path.resolve(process.cwd(), 'server', 'src', 'db', folder),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), folder),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`No se encontró la carpeta de migraciones SQL (${folder}).`);
}

export async function runMigrations(db: DbAdapter = getDb()): Promise<string[]> {
  const migrationsDir = resolveMigrationsDir(db.dialect);
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  await db.execScript(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedNow: string[] = [];

  for (const file of files) {
    const existing = await db.queryOne<{ id: string }>(
      'SELECT id FROM schema_migrations WHERE id = ?',
      [file]
    );
    if (existing) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await db.withTransaction(async (tx) => {
      await tx.execScript(sql);
      await tx.execute('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [
        file,
        new Date().toISOString(),
      ]);
    });
    appliedNow.push(file);
  }

  return appliedNow;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(async (applied) => {
      if (applied.length === 0) {
        console.log('Base de datos al día (no hay migraciones pendientes).');
      } else {
        console.log(`Migraciones aplicadas: ${applied.join(', ')}`);
      }
      await getDb().close();
    })
    .catch((err) => {
      console.error('Error al ejecutar migraciones:', err);
      process.exit(1);
    });
}
