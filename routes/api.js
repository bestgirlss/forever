// routes/api.js
// REST API для фронтенду (index.html). Приймає фабрику з інстансом бота,
// щоб мати змогу надсилати адміну сповіщення про нові заявки на бронювання.

const express = require('express');
const { items, media, schedule } = require('../db/queries');

module.exports = function createApiRouter(bot, adminChatId) {
  const router = express.Router();

  // Список усіх активних карток (для вітрини)
  router.get('/items', (req, res) => {
    const list = items.getAllActive().map((item) => {
      const itemMedia = media.getByItem(item.id);
      return {
        id: item.id,
        name_cz: item.name_cz,
        name_en: item.name_en,
        description_cz: item.description_cz,
        description_en: item.description_en,
        cover: itemMedia.find((m) => m.type === 'photo')?.file_path || null,
      };
    });
    res.json(list);
  });

  // Повна інформація про картку + медіа
  router.get('/items/:id', (req, res) => {
    const item = items.getById(req.params.id);
    if (!item || !item.is_active) {
      return res.status(404).json({ error: 'Картку не знайдено' });
    }
    const itemMedia = media.getByItem(item.id);
    res.json({ ...item, media: itemMedia });
  });

  // Зайняті дати/часи для конкретного місяця (щоб фронтенд заблокував їх у календарі)
  router.get('/items/:id/schedule', (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) {
      return res.status(400).json({ error: 'Потрібні параметри year та month' });
    }
    const rows = schedule.getByItemAndMonth(req.params.id, Number(year), Number(month));

    const dayOffs = rows.filter((r) => r.status === 'day_off').map((r) => r.date);
    const bookedSlots = rows
      .filter((r) => r.status !== 'day_off')
      .map((r) => ({ date: r.date, start: r.start_time, duration: r.duration_minutes }));

    res.json({ dayOffs, bookedSlots });
  });

  // Клієнт надсилає заявку на бронювання
  router.post('/items/:id/bookings', async (req, res) => {
    const itemId = Number(req.params.id);
    const { date, time, name, contact } = req.body;

    if (!date || !time || !name || !contact) {
      return res.status(400).json({ error: 'Заповніть усі поля: дата, час, ім’я, контакт' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({ error: 'Невірний формат дати або часу' });
    }

    const item = items.getById(itemId);
    if (!item || !item.is_active) {
      return res.status(404).json({ error: 'Картку не знайдено' });
    }

    const duration = item.default_duration_minutes || 60;

    if (!schedule.isSlotAvailable(itemId, date, time, duration)) {
      return res.status(409).json({ error: 'Обраний час уже зайнято. Оберіть інший.' });
    }

    const entry = schedule.create({
      itemId,
      date,
      startTime: time,
      durationMinutes: duration,
      status: 'pending',
      clientName: name,
      clientContact: contact,
    });

    // Надсилаємо сповіщення адміну з кнопками підтвердження/відхилення
    if (bot && adminChatId) {
      const text =
        `🔔 *Нова заявка на бронювання*\n\n` +
        `📌 Картка: ${item.name_cz} / ${item.name_en}\n` +
        `📅 Дата: ${date}\n` +
        `🕐 Час: ${time} (${duration} хв)\n` +
        `👤 Ім'я: ${name}\n` +
        `📞 Контакт: ${contact}`;

      bot.telegram.sendMessage(adminChatId, text, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Підтвердити', callback_data: `confirm_booking_${entry.id}` },
            { text: '❌ Відхилити', callback_data: `reject_booking_${entry.id}` },
          ]],
        },
      }).catch((err) => console.error('Не вдалося надіслати сповіщення в Telegram:', err.message));
    }

    res.status(201).json({ success: true, booking: entry });
  });

  return router;
};
