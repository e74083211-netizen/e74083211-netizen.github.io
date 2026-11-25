-- 私人回忆的“收藏 / 喜欢”：每个账号对每段回忆最多一条记录
CREATE TABLE IF NOT EXISTS memory_likes (
  memory_id  TEXT    NOT NULL,   -- content.json 里回忆的 id（如 "01"）
  user_id    TEXT    NOT NULL,   -- 账号 ID
  created_at INTEGER NOT NULL,
  PRIMARY KEY (memory_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_memory_likes_user ON memory_likes (user_id);
