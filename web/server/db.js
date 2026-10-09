// SQLite storage (node:sqlite, no native dependencies).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(path.join(config.dataDir, 'media'), { recursive: true });

// Renamed from "hochzeitsbogen.db" with the rebrand to Ringo – move existing data over once.
const dbFile = path.join(config.dataDir, 'ringo.db');
const legacy = path.join(config.dataDir, 'hochzeitsbogen.db');
if (!fs.existsSync(dbFile) && fs.existsSync(legacy)) {
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(legacy + suffix)) fs.renameSync(legacy + suffix, dbFile + suffix);
  }
}

export const db = new DatabaseSync(dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  pw_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS weddings (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner1 TEXT NOT NULL,
  partner2 TEXT NOT NULL,
  wedding_date TEXT,
  motto TEXT DEFAULT '',
  welcome_text TEXT DEFAULT '',
  story_text TEXT DEFAULT '',
  dresscode TEXT DEFAULT '',
  rsvp_deadline TEXT,
  cover_path TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  upload_key TEXT NOT NULL,
  wall_key TEXT NOT NULL,
  moderate_photos INTEGER NOT NULL DEFAULT 0,
  face_search INTEGER NOT NULL DEFAULT 0,
  unplugged_ceremony INTEGER NOT NULL DEFAULT 0,
  gift_iban TEXT DEFAULT '',
  gift_account_holder TEXT DEFAULT '',
  gift_paypal TEXT DEFAULT '',
  gift_note TEXT DEFAULT '',
  thanks_text TEXT DEFAULT '',
  live_item_id INTEGER,
  meal_options TEXT DEFAULT 'Fleisch|Fisch|Vegetarisch|Vegan',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  wedding_id INTEGER NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  location TEXT DEFAULT '',
  address TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  is_main INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS guests (
  id INTEGER PRIMARY KEY,
  wedding_id INTEGER NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  group_label TEXT DEFAULT '',
  side TEXT DEFAULT 'both',
  role TEXT NOT NULL DEFAULT 'guest',
  plus_one_allowed INTEGER NOT NULL DEFAULT 0,
  plus_one_name TEXT DEFAULT '',
  children INTEGER NOT NULL DEFAULT 0,
  meal TEXT DEFAULT '',
  allergies TEXT DEFAULT '',
  needs_stay INTEGER NOT NULL DEFAULT 0,
  song_wish TEXT DEFAULT '',
  note_to_couple TEXT DEFAULT '',
  internal_note TEXT DEFAULT '',
  table_id INTEGER REFERENCES tables(id) ON DELETE SET NULL,
  invited_at TEXT,
  last_seen_at TEXT,
  face_descriptor TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invitations (
  guest_id INTEGER NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  rsvp TEXT NOT NULL DEFAULT 'open',
  plus_one INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  PRIMARY KEY (guest_id, event_id)
);

CREATE TABLE IF NOT EXISTS program_items (
  id INTEGER PRIMARY KEY,
  wedding_id INTEGER NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_time TEXT DEFAULT '',
  duration_min INTEGER NOT NULL DEFAULT 15,
  host_name TEXT DEFAULT '',
  guest_id INTEGER REFERENCES guests(id) ON DELETE SET NULL,
  description TEXT DEFAULT '',
  requirements TEXT DEFAULT '',
  surprise INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'confirmed',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY,
  wedding_id INTEGER NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_id INTEGER REFERENCES guests(id) ON DELETE SET NULL,
  uploader_name TEXT DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'photo',
  file TEXT NOT NULL,
  thumb TEXT,
  width INTEGER, height INTEGER,
  caption TEXT DEFAULT '',
  approved INTEGER NOT NULL DEFAULT 1,
  favorite INTEGER NOT NULL DEFAULT 0,
  quality REAL,
  ahash TEXT,
  faces TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS photo_likes (
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  liker TEXT NOT NULL,
  PRIMARY KEY (photo_id, liker)
);

CREATE TABLE IF NOT EXISTS guestbook (
  id INTEGER PRIMARY KEY,
  wedding_id INTEGER NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_id INTEGER REFERENCES guests(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'text',
  text TEXT DEFAULT '',
  file TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gift_items (
  id INTEGER PRIMARY KEY,
  wedding_id INTEGER NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'fund',
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  price_cents INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  link TEXT DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pledges (
  id INTEGER PRIMARY KEY,
  wedding_id INTEGER NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES gift_items(id) ON DELETE CASCADE,
  guest_id INTEGER REFERENCES guests(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  units INTEGER NOT NULL DEFAULT 1,
  message TEXT DEFAULT '',
  paid INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tables (
  id INTEGER PRIMARY KEY,
  wedding_id INTEGER NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 8,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS seat_rules (
  id INTEGER PRIMARY KEY,
  wedding_id INTEGER NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_a INTEGER NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  guest_b INTEGER NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('together','apart'))
);

CREATE TABLE IF NOT EXISTS faqs (
  id INTEGER PRIMARY KEY,
  wedding_id INTEGER NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY,
  wedding_id INTEGER NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_id INTEGER REFERENCES guests(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  answer TEXT DEFAULT '',
  answered_by TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY,
  wedding_id INTEGER NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Secret area for witnesses/organizers (hidden from the couple)
CREATE TABLE IF NOT EXISTS team_posts (
  id INTEGER PRIMARY KEY,
  wedding_id INTEGER NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_id INTEGER REFERENCES guests(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Anecdotes guests contribute for speeches (visible to witnesses/organizers only)
CREATE TABLE IF NOT EXISTS anecdotes (
  id INTEGER PRIMARY KEY,
  wedding_id INTEGER NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_id INTEGER REFERENCES guests(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS upgrade_requests (
  id INTEGER PRIMARY KEY,
  wedding_id INTEGER NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  note TEXT DEFAULT '',
  handled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_guests_wedding ON guests(wedding_id);
CREATE INDEX IF NOT EXISTS idx_photos_wedding ON photos(wedding_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_wedding ON events(wedding_id, starts_at);
`);

// Columns added after the first release (CREATE TABLE IF NOT EXISTS does not add them to existing databases).
const addColumn = (table, column, ddl) => {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
};
addColumn('weddings', 'theme', "theme TEXT NOT NULL DEFAULT 'klassisch'");
addColumn('weddings', 'logo_path', 'logo_path TEXT');

/** Small helpers so route code stays readable. */
export const q = {
  get: (sql, ...p) => db.prepare(sql).get(...p),
  all: (sql, ...p) => db.prepare(sql).all(...p),
  run: (sql, ...p) => db.prepare(sql).run(...p),
};

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** Build "UPDATE t SET a=?, b=? WHERE id=?" from a whitelist of allowed fields. */
export function updateFields(table, id, body, allowed, extraWhere = '', extraParams = []) {
  const keys = allowed.filter((k) => body[k] !== undefined);
  if (!keys.length) return 0;
  const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ? ${extraWhere}`;
  const vals = keys.map((k) => (typeof body[k] === 'boolean' ? (body[k] ? 1 : 0) : body[k]));
  return q.run(sql, ...vals, id, ...extraParams).changes;
}
