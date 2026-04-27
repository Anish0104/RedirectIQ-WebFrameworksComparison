# Manages SQLite connections and schema initialization for the Flask RedirectIQ backend.
import sqlite3

from flask import current_app, g

SCHEMA = """
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
"""


def create_connection(db_path):
    connection = sqlite3.connect(db_path, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode = WAL")
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def get_db():
    if "db" not in g:
        g.db = create_connection(current_app.config["RESOLVED_DB_PATH"])

    return g.db


def close_db(error=None):
    connection = g.pop("db", None)

    if connection is not None:
        connection.close()


def init_db():
    connection = create_connection(current_app.config["RESOLVED_DB_PATH"])
    connection.executescript(SCHEMA)
    connection.commit()
    connection.close()


def init_app(app):
    app.teardown_appcontext(close_db)

    with app.app_context():
        init_db()
