import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import pg from 'pg';

const { Pool } = pg;

export type SqlDialect = 'sqlite' | 'postgres';

export interface DbExecutor {
  readonly dialect: SqlDialect;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  insertReturningId(sql: string, params?: unknown[]): Promise<number>;
  execScript(sql: string): Promise<void>;
}

export interface DbAdapter extends DbExecutor {
  withTransaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function convertPlaceholders(sql: string): string {
  let out = '';
  let idx = 1;
  let inSingleQuote = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") {
      if (inSingleQuote && sql[i + 1] === "'") {
        out += "''";
        i += 1;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      out += ch;
    } else if (ch === '?' && !inSingleQuote) {
      out += `$${idx}`;
      idx += 1;
    } else {
      out += ch;
    }
  }
  return out;
}

function toSqliteParams(params: unknown[]): SQLInputValue[] {
  return params.map((p) => (p === undefined ? null : (p as SQLInputValue)));
}

export class SqliteDbAdapter implements DbAdapter {
  readonly dialect: SqlDialect = 'sqlite';
  private db: DatabaseSync;

  constructor(dbPath = resolveSqliteDbPath()) {
    const dir = path.dirname(dbPath);
    if (dbPath !== ':memory:' && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...toSqliteParams(params)) as unknown as T[];
  }

  async queryOne<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<T | undefined> {
    return this.db.prepare(sql).get(...toSqliteParams(params)) as unknown as T | undefined;
  }

  async execute(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
    const info = this.db.prepare(sql).run(...toSqliteParams(params));
    return { changes: Number(info.changes ?? 0) };
  }

  async insertReturningId(sql: string, params: unknown[] = []): Promise<number> {
    const info = this.db.prepare(sql).run(...toSqliteParams(params));
    return Number(info.lastInsertRowid);
  }

  async execScript(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async withTransaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = await fn(this);
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // Ignore rollback error
      }
      throw err;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

class PgClientExecutor implements DbExecutor {
  readonly dialect: SqlDialect = 'postgres';
  private client: pg.Pool | pg.PoolClient;

  constructor(client: pg.Pool | pg.PoolClient) {
    this.client = client;
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.client.query(convertPlaceholders(sql), params);
    return res.rows as T[];
  }

  async queryOne<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<T | undefined> {
    const res = await this.client.query(convertPlaceholders(sql), params);
    return res.rows[0] as T | undefined;
  }

  async execute(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
    const res = await this.client.query(convertPlaceholders(sql), params);
    return { changes: Number(res.rowCount ?? 0) };
  }

  async insertReturningId(sql: string, params: unknown[] = []): Promise<number> {
    const pgSql = `${convertPlaceholders(sql)} RETURNING id`;
    const res = await this.client.query(pgSql, params);
    return Number(res.rows[0]?.id);
  }

  async execScript(sql: string): Promise<void> {
    await this.client.query(sql);
  }
}

export class PostgresDbAdapter extends PgClientExecutor implements DbAdapter {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    const isLocal =
      connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
    const pool = new Pool({
      connectionString,
      max: Number(process.env.PG_POOL_MAX ?? (process.env.VERCEL === '1' ? 3 : 10)),
      ssl: isLocal ? false : { rejectUnauthorized: false },
    });
    super(pool);
    this.pool = pool;
  }

  async withTransaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tx = new PgClientExecutor(client);
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback error
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

let dbInstance: DbAdapter | null = null;

export function resolveSqliteDbPath(): string {
  return process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.resolve(process.cwd(), 'data', 'rifas.db');
}

export function getDb(): DbAdapter {
  if (!dbInstance) {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (databaseUrl) {
      dbInstance = new PostgresDbAdapter(databaseUrl);
    } else {
      dbInstance = new SqliteDbAdapter();
    }
  }
  return dbInstance;
}

export function setDbForTesting(db: DbAdapter | null): void {
  dbInstance = db;
}
