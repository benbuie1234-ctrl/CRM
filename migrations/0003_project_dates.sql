-- Run this only against a database that was already initialized before this migration
-- (a fresh database should just use schema.sql, which already includes these columns).
ALTER TABLE projects ADD COLUMN created_date TEXT;
ALTER TABLE projects ADD COLUMN completed_date TEXT;

UPDATE projects SET created_date = date(created_at) WHERE created_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_created_date ON projects(created_date);
CREATE INDEX IF NOT EXISTS idx_projects_completed_date ON projects(completed_date);
