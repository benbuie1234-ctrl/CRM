-- Full reset: replaces the projects/reels concept with a nested folder + video
-- file-browser model. Destructive by request — wipes existing clients/projects.
DROP TABLE IF EXISTS projects;
DELETE FROM clients;

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  parent_folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  footage_link TEXT,
  reference_links TEXT,
  instructions TEXT,
  export_link TEXT,
  price REAL,
  paid INTEGER NOT NULL DEFAULT 0,
  created_date TEXT NOT NULL DEFAULT (date('now')),
  completed_date TEXT,
  share_slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_folders_client ON folders(client_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_folder_id);
CREATE INDEX IF NOT EXISTS idx_videos_client ON videos(client_id);
CREATE INDEX IF NOT EXISTS idx_videos_folder ON videos(folder_id);
CREATE INDEX IF NOT EXISTS idx_videos_share_slug ON videos(share_slug);
CREATE INDEX IF NOT EXISTS idx_videos_created_date ON videos(created_date);
