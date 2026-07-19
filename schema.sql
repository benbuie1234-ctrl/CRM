CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  drive_link TEXT,
  notes TEXT,
  billing_type TEXT NOT NULL DEFAULT 'per_project',
  retainer_amount REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_share_slug ON projects(share_slug);
CREATE INDEX IF NOT EXISTS idx_projects_created_date ON projects(created_date);
CREATE INDEX IF NOT EXISTS idx_projects_completed_date ON projects(completed_date);
