// Initializes the SQLite database and ensures the RedirectIQ schema exists.
const path = require('path');
const Database = require('better-sqlite3');

const appRoot = path.resolve(__dirname, '..');
const configuredDbPath = process.env.DB_PATH || './redirectiq.db';
const dbPath = path.isAbsolute(configuredDbPath)
  ? configuredDbPath
  : path.resolve(appRoot, configuredDbPath);
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS links (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    original_url TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    custom_slug INTEGER DEFAULT 0,
    expires_at TEXT,
    active INTEGER DEFAULT 1,
    password_hash TEXT,
    is_split INTEGER DEFAULT 0,
    split_url_b TEXT,
    split_ratio REAL DEFAULT 0.5,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS clicks (
    id TEXT PRIMARY KEY,
    link_id TEXT,
    clicked_at TEXT DEFAULT (datetime('now')),
    referrer TEXT,
    user_agent TEXT,
    country TEXT,
    city TEXT,
    FOREIGN KEY (link_id) REFERENCES links(id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    link_id TEXT,
    visitor_token TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (link_id) REFERENCES links(id)
  );

  CREATE INDEX IF NOT EXISTS idx_links_slug ON links(slug);
  CREATE INDEX IF NOT EXISTS idx_clicks_link_id ON clicks(link_id);
`);

module.exports = db;
