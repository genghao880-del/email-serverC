-- =========================================================
-- MailBrain Worker 数据库结构定义
-- 适用于 Cloudflare D1 / SQLite 兼容引擎
-- 作者：GPT-5 (为域名 111671.xyz 定制)
-- =========================================================

-- =============================
-- 表 1️⃣ 令牌表 (tokens)
-- =============================
CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,                -- 令牌UUID
  max_uses INTEGER NOT NULL,          -- 最大可使用次数
  used INTEGER DEFAULT 0,             -- 当前已使用次数
  created_by TEXT,                    -- 创建者用户名
  active INTEGER DEFAULT 1,           -- 是否启用（1启用，0禁用）
  created_at TEXT DEFAULT (datetime('now')), -- 创建时间
  last_use TEXT                       -- 最后使用时间
);

CREATE INDEX IF NOT EXISTS idx_tokens_active ON tokens(active);
CREATE INDEX IF NOT EXISTS idx_tokens_created_at ON tokens(created_at);

-- =============================
-- 表 2️⃣ 用户表 (users)
-- =============================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                -- 用户UUID
  email TEXT UNIQUE,                  -- 完整邮箱地址，例如 admin@111671.xyz
  local_part TEXT,                    -- 邮箱前缀部分
  domain TEXT,                        -- 邮箱域名部分
  token_id TEXT,                      -- 注册所用令牌ID
  status TEXT DEFAULT 'active',       -- 状态（active, suspended, deleted）
  r2_prefix TEXT,                     -- 文件或邮箱前缀，用于R2存储（保留字段）
  created_at TEXT DEFAULT (datetime('now')), -- 创建时间
  FOREIGN KEY (token_id) REFERENCES tokens(id)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- =============================
-- 表 3️⃣ 日志表 (audit)
-- =============================
CREATE TABLE IF NOT EXISTS audit (
  id TEXT PRIMARY KEY,                -- 日志UUID
  actor TEXT,                         -- 操作发起人（email或root）
  action TEXT,                        -- 操作类型，例如 register, disable, delete
  target TEXT,                        -- 操作目标对象（用户或token）
  result TEXT,                        -- 结果描述（ok, fail, error）
  ip TEXT,                            -- 请求来源IP
  ts TEXT DEFAULT (datetime('now'))   -- 记录时间
);

CREATE INDEX IF NOT EXISTS idx_audit_action ON audit(action);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit(ts);

-- =============================
-- 表 4️⃣ 系统配置表 (config)
-- =============================
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO config (key, value)
VALUES
  ('version', '1.0'),
  ('domain', '111671.xyz'),
  ('created_by', 'root');

-- =============================
-- 视图 1️⃣ 用户统计视图 (v_user_stats)
-- =============================
CREATE VIEW IF NOT EXISTS v_user_stats AS
SELECT
  t.id AS token_id,
  t.max_uses,
  t.used,
  t.active,
  COUNT(u.id) AS user_count,
  MIN(u.created_at) AS first_user_created,
  MAX(u.created_at) AS last_user_created
FROM tokens t
LEFT JOIN users u ON u.token_id = t.id
GROUP BY t.id;

-- =========================================================
-- 初始化完成日志
-- =========================================================
INSERT OR IGNORE INTO audit (id, actor, action, target, result, ip, ts)
VALUES (
  lower(hex(randomblob(16))),
  'system',
  'init_db',
  'MAILDB',
  'ok',
  '127.0.0.1',
  datetime('now')
);
