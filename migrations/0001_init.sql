-- 留言墙
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname   TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'pending')),
  ip_hash    TEXT,               -- 加盐哈希，仅用于防刷，不保存原始 IP
  created_at INTEGER NOT NULL    -- 毫秒时间戳
);
CREATE INDEX IF NOT EXISTS idx_messages_status_id ON messages (status, id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_ip ON messages (ip_hash, created_at);

-- 简单的限流计数（口令尝试、留言频率）
CREATE TABLE IF NOT EXISTS rate_limits (
  key      TEXT    PRIMARY KEY,
  count    INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
