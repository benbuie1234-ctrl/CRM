-- Run this only against a database that was already initialized before this migration
-- (a fresh database should just use schema.sql, which already includes this column).
ALTER TABLE clients ADD COLUMN share_slug TEXT;

UPDATE clients SET share_slug = lower(hex(randomblob(6))) WHERE share_slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_share_slug_unique ON clients(share_slug);
