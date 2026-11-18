-- Migración inicial PostgreSQL (Supabase): administradores, sesiones, intentos de login, rifas, compradores y números

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_admin_id ON sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  attempt_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS raffles (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  draw_date TEXT NOT NULL,
  prize_text TEXT NOT NULL,
  lottery_name TEXT NOT NULL,
  ticket_price_cop INTEGER NOT NULL CHECK(ticket_price_cop >= 1000),
  payment_instructions TEXT NOT NULL,
  release_hours INTEGER NOT NULL DEFAULT 24 CHECK(release_hours >= 1 AND release_hours <= 720),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'active', 'closed')),
  winning_number TEXT NULL CHECK(winning_number IS NULL OR winning_number ~ '^[0-9]{2}$'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_raffles_admin_id ON raffles(admin_id);
CREATE INDEX IF NOT EXISTS idx_raffles_slug ON raffles(slug);
CREATE INDEX IF NOT EXISTS idx_raffles_status ON raffles(status);

CREATE TABLE IF NOT EXISTS buyers (
  id SERIAL PRIMARY KEY,
  raffle_id INTEGER NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_buyers_raffle_id ON buyers(raffle_id);
CREATE INDEX IF NOT EXISTS idx_buyers_phone ON buyers(raffle_id, phone);

CREATE TABLE IF NOT EXISTS raffle_numbers (
  id SERIAL PRIMARY KEY,
  raffle_id INTEGER NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
  number TEXT NOT NULL CHECK(number ~ '^[0-9]{2}$'),
  buyer_id INTEGER NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('pending', 'paid')),
  payment_method TEXT NOT NULL DEFAULT '',
  reserved_at TEXT NOT NULL,
  expires_at TEXT NULL,
  paid_at TEXT NULL,
  UNIQUE(raffle_id, number)
);

CREATE INDEX IF NOT EXISTS idx_raffle_numbers_raffle_status ON raffle_numbers(raffle_id, status);
CREATE INDEX IF NOT EXISTS idx_raffle_numbers_buyer_id ON raffle_numbers(buyer_id);
CREATE INDEX IF NOT EXISTS idx_raffle_numbers_expires_at ON raffle_numbers(status, expires_at);
