-- 个人账号：私密区域和共同相册改为“邀请注册 + 用户名密码登录”，不再使用共用口令。

CREATE TABLE IF NOT EXISTS users (
  id                  TEXT    PRIMARY KEY,             -- 随机 UUID，稳定不变
  username            TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  display_name        TEXT    NOT NULL,
  password_hash       TEXT    NOT NULL,                -- PBKDF2-SHA256（Web Crypto），格式见 src/lib/password.js；从不保存明文
  role                TEXT    NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  disabled            INTEGER NOT NULL DEFAULT 0,
  created_at          INTEGER NOT NULL,
  password_changed_at INTEGER NOT NULL,
  last_login_at       INTEGER
);

-- 服务器端会话：Cookie 里只有随机令牌，数据库只存它的 SHA-256 摘要
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT    PRIMARY KEY,                      -- SHA-256(令牌) 的十六进制
  user_id    TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

-- 邀请注册链接 / 重置密码链接：一次性、会过期；同样只存令牌摘要
CREATE TABLE IF NOT EXISTS invites (
  id         TEXT    PRIMARY KEY,                      -- 随机 UUID，用来在后台撤销
  token_hash TEXT    NOT NULL UNIQUE,
  kind       TEXT    NOT NULL CHECK (kind IN ('register', 'reset')),
  role       TEXT    NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  user_id    TEXT,                                     -- 重置密码时：要重置的账号
  note       TEXT    NOT NULL DEFAULT '',
  created_by TEXT,                                     -- 创建者账号；命令行创建时为 NULL
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER,
  used_by    TEXT
);

-- 相册内容与账号关联（旧记录为 NULL = “未归属”，只有管理员能管理，可在后台指定归属）
ALTER TABLE album_memories ADD COLUMN owner_id TEXT;
ALTER TABLE album_photos ADD COLUMN owner_id TEXT;
CREATE INDEX IF NOT EXISTS idx_album_memories_owner ON album_memories (owner_id);
