-- 共同相册：口令解锁后的访客都可以添加；编辑和删除只有管理员可以做
CREATE TABLE IF NOT EXISTS album_memories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  happened_on TEXT,               -- 可选，YYYY-MM-DD
  body        TEXT    NOT NULL DEFAULT '',
  author      TEXT    NOT NULL DEFAULT '',  -- 只是显示用的署名，不是身份验证
  ip_hash     TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER
);

-- 照片文件本身存在私有 R2 存储桶里，这里只记录元数据
CREATE TABLE IF NOT EXISTS album_photos (
  id         TEXT    PRIMARY KEY,           -- 随机 UUID，同时是 R2 里的目录名
  memory_id  INTEGER,                       -- 还没归入某条回忆时为 NULL（未完成的上传，稍后自动清理）
  position   INTEGER NOT NULL DEFAULT 0,
  width      INTEGER,
  height     INTEGER,
  size       INTEGER,
  ip_hash    TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_album_photos_memory ON album_photos (memory_id, position);
CREATE INDEX IF NOT EXISTS idx_album_photos_pending ON album_photos (created_at) WHERE memory_id IS NULL;
