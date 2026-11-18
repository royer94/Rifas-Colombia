import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { getDb } from './connection.js';

function resolveMigrationsDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'server', 'src', 'db', 'migrations'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'migrations'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error('No se encontró la carpeta de migraciones SQL.');
}

export function runMigrations(db: DatabaseSync = getDb()): string[] {
  const migrationsDir = resolveMigrationsDir();
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedStmt = db.prepare('SELECT id FROM schema_migrations WHERE id = ?');
  const insertStmt = db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)');
  const appliedNow: string[] = [];

  for (const file of files) {
    const existing = appliedStmt.get(file) as { id: string } | undefined;
    if (existing) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(sql);
      insertStmt.run(file, new Date().toISOString());
      db.exec('COMMIT');
      appliedNow.push(file);
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  return appliedNow;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const applied = runMigrations();
  if (applied.length === 0) {
    console.log('Base de datos al día (no hay migraciones pendientes).');
  } else {
    console.log(`Migraciones aplicadas: ${applied.join(', ')}`);
  }
}
