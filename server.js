// server.js
// Точка входу: піднімає Express (статика + REST API) і Telegram-бота
// (адмін-панель) в одному Node.js-процесі.

require('dotenv').config();
const path = require('path');
const express = require('express');

const createBot = require('./bot');
const createApiRouter = require('./routes/api');

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
  console.error('❌ Відсутні BOT_TOKEN або ADMIN_CHAT_ID у .env файлі. Перевірте .env.example.');
  process.exit(1);
}

const app = express();
app.use(express.json());

// Роздаємо завантажені медіафайли та фронтенд
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// --- Telegram-бот (адмін-панель) ---
const bot = createBot(BOT_TOKEN, ADMIN_CHAT_ID);

// --- REST API для фронтенду (отримує bot, щоб слати сповіщення адміну) ---
app.use('/api', createApiRouter(bot, ADMIN_CHAT_ID));

// Фронтенд - віддаємо index.html на будь-який інший GET-запит (SPA-friendly)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🌐 Сервер запущено: http://localhost:${PORT}`);
});

bot.launch()
  .then(() => console.log('🤖 Telegram-бот запущено'))
  .catch((err) => console.error('❌ Не вдалося запустити бота:', err));

// Коректне завершення роботи бота
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
