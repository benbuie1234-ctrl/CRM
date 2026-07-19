-- Run this only against a database that was already initialized with the original schema.sql
-- (a fresh database should just use schema.sql, which already includes these columns).
ALTER TABLE clients ADD COLUMN billing_type TEXT NOT NULL DEFAULT 'per_project';
ALTER TABLE clients ADD COLUMN retainer_amount REAL;
ALTER TABLE projects ADD COLUMN reference_links TEXT;
ALTER TABLE projects ADD COLUMN price REAL;
ALTER TABLE projects ADD COLUMN paid INTEGER NOT NULL DEFAULT 0;
