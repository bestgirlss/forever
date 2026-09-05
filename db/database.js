// db/database.js
// Ініціалізація SQLite (better-sqlite3) та створення схеми, якщо вона відсутня.
// Уся структура зібрана в одному файлі бази даних booking.db у корені проєкту.

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'booking.db');

const db = new Database(DB_PATH);

// WAL-режим дає кращу продуктивність при паралельних читаннях/записах
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    name_cz                 TEXT NOT NULL,
    name_en                 TEXT NOT NULL,
    description_cz          TEXT DEFAULT '',
    description_en          TEXT DEFAULT '',
    services_cz             TEXT DEFAULT '[]',   -- JSON-масив рядків
    services_en             TEXT DEFAULT '[]',   -- JSON-масив рядків
    whatsapp_number         TEXT DEFAULT '',
    default_duration_minutes INTEGER DEFAULT 60,
    is_active               INTEGER DEFAULT 1,
    created_at              DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS media (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id     INTEGER NOT NULL,
    type        TEXT NOT NULL CHECK(type IN ('photo','video')),
    file_path   TEXT NOT NULL,      -- відносний шлях, напр. uploads/3/163241.jpg
    sort_order  INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS schedule (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id           INTEGER NOT NULL,
    date              TEXT NOT NULL,     -- YYYY-MM-DD
    start_time        TEXT,              -- HH:MM, NULL для повного вихідного дня
    duration_minutes  INTEGER,           -- NULL для повного вихідного дня
    status            TEXT NOT NULL CHECK(status IN ('booked','pending','day_off')),
    client_name       TEXT,
    client_contact    TEXT,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_schedule_item_date ON schedule(item_id, date);
  CREATE INDEX IF NOT EXISTS idx_media_item ON media(item_id);
`);

module.exports = db;
