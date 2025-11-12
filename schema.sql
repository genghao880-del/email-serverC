CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,
  max_uses INTEGER DEFAULT 5,
  used INTEGER DEFAULT 0,
  created_by TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  local_part TEXT,
  domain TEXT,
  token_id TEXT,
  status TEXT DEFAULT 'active',
  r2_prefix TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  FOREIGN KEY(token_id) REFERENCES tokens(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  from_addr TEXT,
  subject TEXT,
  hash TEXT UNIQUE,
  size INTEGER,
  r2_key TEXT,
  received_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  status TEXT DEFAULT 'received',
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit (
  id TEXT PRIMARY KEY,
  actor TEXT,
  action TEXT,
  target TEXT,
  result TEXT,
  ip TEXT,
  ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
