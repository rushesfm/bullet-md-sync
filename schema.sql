DROP TABLE IF EXISTS notes;
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  content TEXT,
  updated_at INTEGER,
  deleted INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);
