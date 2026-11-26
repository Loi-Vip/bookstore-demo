import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(filename, initialProducts) {
  mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      username_key TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('customer', 'admin')),
      created_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      stock INTEGER NOT NULL CHECK (stock >= 0),
      active INTEGER NOT NULL CHECK (active IN (0, 1)),
      revision INTEGER NOT NULL DEFAULT 1
    ) STRICT;
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'cancelled')),
      payload TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      UNIQUE(user_id, idempotency_key)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id, created_at);
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) STRICT;
  `);
  if (!db.prepare('PRAGMA table_info(products)').all().some(column => column.name === 'revision')) {
    db.exec('ALTER TABLE products ADD COLUMN revision INTEGER NOT NULL DEFAULT 1');
  }
  if (!db.prepare('SELECT value FROM metadata WHERE key = ?').get('catalog_seeded')) {
    transaction(db, () => {
      const insert = db.prepare('INSERT INTO products (id, payload, stock, active) VALUES (?, ?, ?, 1)');
      for (const product of initialProducts) insert.run(product.id, JSON.stringify(product), product.stock);
      db.prepare('INSERT INTO metadata (key, value) VALUES (?, ?)').run('catalog_seeded', '1');
    });
  }
  return db;
}

export function transaction(db, operation) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function productFromRow(row) {
  return row ? { ...JSON.parse(row.payload), stock: row.stock, active: Boolean(row.active), revision: row.revision } : undefined;
}

export function listProducts(db, includeUnpublished = false) {
  const rows = db.prepare(`SELECT * FROM products ${includeUnpublished ? '' : 'WHERE active = 1'} ORDER BY json_extract(payload, '$.releaseOrder') DESC, id`).all();
  return rows.map(productFromRow);
}

export function orderFromRow(row) {
  return { ...JSON.parse(row.payload), id: row.id, code: row.code, createdAt: row.created_at, status: row.status, username: row.username };
}
