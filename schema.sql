-- ========== schema_v2.sql ==========
-- 统一状态字段、索引优化、缓存辅助字段

-- 1️⃣ Token 表
CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,
  max_uses INTEGER NOT NULL,
  used INTEGER DEFAULT 0,
  created_by TEXT,
  status TEXT DEFAULT 'active',  -- 替代原 active 字段
  created_at TEXT,
  last_use TEXT
);

CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens(status);
CREATE INDEX IF NOT EXISTS idx_tokens_last_use ON tokens(last_use);

-- 2️⃣ 用户表
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  local_part TEXT,
  domain TEXT,
  token_id TEXT,
  status TEXT DEFAULT 'active',
  r2_prefix TEXT,
  created_at TEXT,
  FOREIGN KEY (token_id) REFERENCES tokens(id)
);

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_domain ON users(domain);

-- 3️⃣ 审计日志表
CREATE TABLE IF NOT EXISTS audit (
  id TEXT PRIMARY KEY,
  actor TEXT,
  action TEXT,
  target TEXT,
  result TEXT,
  ip TEXT,
  ts TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_action ON audit(action);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit(ts);

-- 4️⃣ 配置表
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO config (key, value)
VALUES
  ('version', '2.0'),
  ('domain', '111671.xyz'),
  ('created_by', 'root');

-- 5️⃣ 如果旧版本存在 active 字段，进行迁移
-- (D1 不支持 ALTER COLUMN，所以可在控制台手动执行)
-- ALTER TABLE tokens RENAME COLUMN active TO status;
-- UPDATE tokens SET status='active' WHERE status IS NULL;
