// db/queries.js
// Єдиний шар доступу до даних. Усі SQL-запити живуть тут — і API, і бот
// звертаються тільки до цих функцій. Це дозволяє легко розширювати логіку
// в майбутньому, не чіпаючи роути чи сцени бота.

const db = require('./database');

/* ---------------------------------- ITEMS -------------------------------- */

function parseItemRow(row) {
  if (!row) return null;
  return {
    ...row,
    services_cz: safeJsonParse(row.services_cz, []),
    services_en: safeJsonParse(row.services_en, []),
  };
}

function safeJsonParse(str, fallback) {
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

const items = {
  getAllActive() {
    const rows = db.prepare(
      `SELECT * FROM items WHERE is_active = 1 ORDER BY created_at DESC`
    ).all();
    return rows.map(parseItemRow);
  },

  getAll() {
    const rows = db.prepare(`SELECT * FROM items ORDER BY created_at DESC`).all();
    return rows.map(parseItemRow);
  },

  getById(id) {
    const row = db.prepare(`SELECT * FROM items WHERE id = ?`).get(id);
    return parseItemRow(row);
  },

  create(data) {
    const stmt = db.prepare(`
      INSERT INTO items
        (name_cz, name_en, description_cz, description_en, services_cz, services_en, whatsapp_number, default_duration_minutes)
      VALUES (@name_cz, @name_en, @description_cz, @description_en, @services_cz, @services_en, @whatsapp_number, @default_duration_minutes)
    `);
    const info = stmt.run({
      name_cz: data.name_cz,
      name_en: data.name_en,
      description_cz: data.description_cz || '',
      description_en: data.description_en || '',
      services_cz: JSON.stringify(data.services_cz || []),
      services_en: JSON.stringify(data.services_en || []),
      whatsapp_number: data.whatsapp_number || '',
      default_duration_minutes: data.default_duration_minutes || 60,
    });
    return this.getById(info.lastInsertRowid);
  },

  updateField(id, field, value) {
    const allowed = [
      'name_cz', 'name_en', 'description_cz', 'description_en',
      'services_cz', 'services_en', 'whatsapp_number', 'default_duration_minutes',
      'is_active',
    ];
    if (!allowed.includes(field)) throw new Error(`Поле "${field}" не можна редагувати`);

    const storedValue = (field === 'services_cz' || field === 'services_en')
      ? JSON.stringify(value)
      : value;

    db.prepare(`UPDATE items SET ${field} = ? WHERE id = ?`).run(storedValue, id);
    return this.getById(id);
  },

  delete(id) {
    // Каскадно видаляє медіа та записи графіку завдяки ON DELETE CASCADE
    return db.prepare(`DELETE FROM items WHERE id = ?`).run(id);
  },
};

/* ---------------------------------- MEDIA -------------------------------- */

const media = {
  getByItem(itemId) {
    return db.prepare(
      `SELECT * FROM media WHERE item_id = ? ORDER BY sort_order ASC, id ASC`
    ).all(itemId);
  },

  add(itemId, type, filePath) {
    const maxOrder = db.prepare(
      `SELECT COALESCE(MAX(sort_order), -1) AS m FROM media WHERE item_id = ?`
    ).get(itemId).m;
    const info = db.prepare(
      `INSERT INTO media (item_id, type, file_path, sort_order) VALUES (?, ?, ?, ?)`
    ).run(itemId, type, filePath, maxOrder + 1);
    return db.prepare(`SELECT * FROM media WHERE id = ?`).get(info.lastInsertRowid);
  },

  deleteById(id) {
    return db.prepare(`DELETE FROM media WHERE id = ?`).run(id);
  },

  getById(id) {
    return db.prepare(`SELECT * FROM media WHERE id = ?`).get(id);
  },
};

/* -------------------------------- SCHEDULE ------------------------------- */

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const schedule = {
  getByItemAndMonth(itemId, year, month) {
    // month: 1-12
    const monthStr = String(month).padStart(2, '0');
    const prefix = `${year}-${monthStr}`;
    return db.prepare(
      `SELECT * FROM schedule WHERE item_id = ? AND date LIKE ? AND status IN ('booked','pending','day_off') ORDER BY date, start_time`
    ).all(itemId, `${prefix}%`);
  },

  getByItem(itemId) {
    return db.prepare(
      `SELECT * FROM schedule WHERE item_id = ? ORDER BY date DESC, start_time DESC`
    ).all(itemId);
  },

  getById(id) {
    return db.prepare(`SELECT * FROM schedule WHERE id = ?`).get(id);
  },

  // Перевіряє, чи вільний конкретний часовий слот для картки
  isSlotAvailable(itemId, date, startTime, durationMinutes, excludeId = null) {
    const dayOff = db.prepare(
      `SELECT 1 FROM schedule WHERE item_id = ? AND date = ? AND status = 'day_off'`
    ).get(itemId, date);
    if (dayOff) return false;

    const rows = db.prepare(
      `SELECT * FROM schedule WHERE item_id = ? AND date = ? AND status IN ('booked','pending') ${excludeId ? 'AND id != ?' : ''}`
    ).all(...(excludeId ? [itemId, date, excludeId] : [itemId, date]));

    const newStart = timeToMinutes(startTime);
    const newEnd = newStart + Number(durationMinutes);

    for (const row of rows) {
      if (!row.start_time || row.duration_minutes == null) continue;
      const existingStart = timeToMinutes(row.start_time);
      const existingEnd = existingStart + row.duration_minutes;
      const overlaps = newStart < existingEnd && existingStart < newEnd;
      if (overlaps) return false;
    }
    return true;
  },

  create({ itemId, date, startTime = null, durationMinutes = null, status, clientName = null, clientContact = null }) {
    const info = db.prepare(`
      INSERT INTO schedule (item_id, date, start_time, duration_minutes, status, client_name, client_contact)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(itemId, date, startTime, durationMinutes, status, clientName, clientContact);
    return this.getById(info.lastInsertRowid);
  },

  updateStatus(id, status) {
    db.prepare(`UPDATE schedule SET status = ? WHERE id = ?`).run(status, id);
    return this.getById(id);
  },

  delete(id) {
    return db.prepare(`DELETE FROM schedule WHERE id = ?`).run(id);
  },
};

module.exports = { items, media, schedule };
